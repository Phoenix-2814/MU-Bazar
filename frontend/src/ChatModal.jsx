import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './ChatModal.css';

const API_BASE_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');
const QUICK_MESSAGES = ['Hi', 'What is the final price?', 'Can you lower the price?'];

function getId(value) {
  return typeof value === 'string' ? value : value?._id || value?.id;
}

function sortMessagesByTime(messages) {
  return [...messages].sort((first, second) => (
    new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
  ));
}

export default function ChatModal({ conversationId, currentUser, token, onUnreadCountChange, onClose }) {
  const [activeConversationId, setActiveConversationId] = useState(conversationId || null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const currentUserId = getId(currentUser);

  useEffect(() => {
    setActiveConversationId(conversationId || null);
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeConversationId) {
      setLoading(true);
      axios
        .get(`${API_BASE_URL}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          if (!cancelled) setConversations(res.data);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err.response?.data?.message || 'Could not load your conversations.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setError('');
    setLoading(true);
    setMessages([]);

    axios
      .get(`${API_BASE_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!cancelled) setConversations(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Could not load conversation details.');
        }
      });

    const markConversationRead = () => {
      axios
        .patch(
          `${API_BASE_URL}/api/chat/conversations/${activeConversationId}/read`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        )
        .then((res) => {
          if (!cancelled) onUnreadCountChange(res.data.unreadCount || 0);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err.response?.data?.message || 'Could not mark messages as read.');
          }
        });
    };

    markConversationRead();

    axios
      .get(`${API_BASE_URL}/api/chat/messages/${activeConversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!cancelled) {
          setMessages((currentMessages) => {
            const historyIds = new Set(res.data.map((message) => message._id));
            return sortMessagesByTime([
              ...res.data,
              ...currentMessages.filter((message) => !historyIds.has(message._id)),
            ]);
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Could not load messages.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const socket = io(API_BASE_URL, { autoConnect: false, auth: { token } });
    socketRef.current = socket;

    const joinConversation = () => {
      if (!cancelled) {
        setError((currentError) => (
          currentError === 'Chat connection failed. Please refresh and try again.'
            ? ''
            : currentError
        ));
      }
      socket.emit('join_room', activeConversationId, (result) => {
        if (result?.error && !cancelled) setError(result.error);
      });
    };
    const receiveMessage = (message) => {
      if (!cancelled && getId(message.conversationId) === activeConversationId) {
        setMessages((previous) => {
          if (previous.some((existing) => existing._id === message._id)) return previous;
          return sortMessagesByTime([...previous, message]);
        });
        if (getId(message.sender) !== currentUserId) markConversationRead();
      }
    };
    const handleMessagesRead = ({ conversationId: readConversationId, readerId } = {}) => {
      if (cancelled || readConversationId !== activeConversationId || !readerId) return;
      setMessages((previous) => previous.map((message) => {
        if (getId(message.sender) !== currentUserId) return message;
        const readBy = message.readBy || [];
        if (readBy.some((reader) => getId(reader) === readerId)) return message;
        return { ...message, readBy: [...readBy, readerId] };
      }));
    };
    const handleSocketError = () => {
      if (!cancelled) setError('Chat connection failed. Please refresh and try again.');
    };

    socket.on('connect', joinConversation);
    socket.on('receive_message', receiveMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('connect_error', handleSocketError);
    socket.connect();

    return () => {
      cancelled = true;
      if (socket.connected) socket.emit('leave_room', activeConversationId);
      socket.off('connect', joinConversation);
      socket.off('receive_message', receiveMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('connect_error', handleSocketError);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [activeConversationId, currentUserId, onUnreadCountChange, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (event) => {
    event.preventDefault();
    const messageText = text.trim();
    if (!messageText || !activeConversationId || sending) return;
    if (messageText.length > 2000) {
      setError('Messages cannot exceed 2000 characters.');
      return;
    }
    if (!socketRef.current?.connected) {
      setError('Chat is not connected. Please try again.');
      return;
    }

    setError('');
    setSending(true);
    socketRef.current.timeout(10000).emit(
      'send_message',
      { conversationId: activeConversationId, text: messageText },
      (timeoutError, result) => {
        if (timeoutError) {
          setError('Message could not be sent. Check your connection and try again.');
        } else if (result?.error) {
          setError(result.error);
        } else {
          setText((currentText) => (currentText === messageText ? '' : currentText));
        }
        setSending(false);
      }
    );
  };

  const getConversationTitle = (conversation) => {
    const otherMember = conversation.members?.find((member) => getId(member) !== currentUserId);
    return otherMember?.name || 'Marketplace user';
  };
  const activeConversation = conversations.find((item) => item._id === activeConversationId);
  const otherUserId = activeConversation?.members
    ?.map(getId)
    .find((memberId) => memberId !== currentUserId);

  return (
    <div className="chat-modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="chat-modal-container" role="dialog" aria-modal="true" aria-label="Messages">
        <header className="chat-header">
          {activeConversationId && (
            <button className="chat-back-button" type="button" onClick={() => setActiveConversationId(null)}>
              All messages
            </button>
          )}
          <div>
            <h2>{activeConversationId ? 'Chat' : 'Your messages'}</h2>
            {activeConversationId && activeConversation && (
              <>
                <span>Chat with {getConversationTitle(activeConversation)}</span>
                <div className="chat-product-context">
                  {activeConversation.itemId?.images?.[0] ? (
                    <img
                      className="chat-product-image"
                      src={activeConversation.itemId.images[0]}
                      alt={activeConversation.itemId.title || 'Product'}
                    />
                  ) : (
                    <div className="chat-product-image chat-product-image-placeholder" aria-hidden="true">
                      No image
                    </div>
                  )}
                  <div className="chat-product-details">
                    <span className="chat-product-title">
                      {activeConversation.itemId ? activeConversation.itemId.title || 'Listing' : 'Listing removed'}
                    </span>
                    {activeConversation.itemId?.price != null && (
                      <strong>₹{activeConversation.itemId.price}</strong>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="chat-close-button" type="button" aria-label="Close chat">
            &times;
          </button>
        </header>

        {error && <p className="chat-error" role="alert">{error}</p>}

        {!activeConversationId ? (
          <div className="chat-conversation-list">
            {loading ? (
              <p className="chat-empty-state">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <p className="chat-empty-state">No messages yet. Contact a seller from a listing to start chatting.</p>
            ) : conversations.map((conversation) => (
              <button
                className="chat-conversation-item"
                key={conversation._id}
                type="button"
                onClick={() => setActiveConversationId(conversation._id)}
              >
                <span className="chat-conversation-copy">
                  <strong>{getConversationTitle(conversation)}</strong>
                  <span>{conversation.itemId ? conversation.itemId.title || 'Listing' : 'Listing removed'}</span>
                  <span className="chat-last-message">{conversation.lastMessage || 'Start the conversation'}</span>
                </span>
                <span className="chat-conversation-price">
                  {conversation.itemId?.price != null ? `₹${conversation.itemId.price}` : ''}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="chat-body" aria-live="polite">
              {loading && <p className="chat-empty-state">Loading messages...</p>}
              {!loading && messages.length === 0 && (
                <p className="chat-empty-state">Say hello to start the conversation.</p>
              )}
              {messages.map((message) => {
                const senderId = getId(message.sender);
                const isMine = senderId === currentUserId;
                return (
                  <div key={message._id} className={`chat-message ${isMine ? 'chat-mine' : 'chat-other'}`}>
                    <div className="chat-bubble">
                      <p>{message.text}</p>
                      <time className="chat-time" dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {isMine && (
                        <span
                          className={`chat-read-status ${
                            message.readBy?.some((reader) => getId(reader) === otherUserId) ? 'is-seen' : ''
                          }`}
                          aria-label={
                            message.readBy?.some((reader) => getId(reader) === otherUserId)
                              ? 'Seen by recipient'
                              : 'Sent, not seen yet'
                          }
                        >
                          {message.readBy?.some((reader) => getId(reader) === otherUserId) ? 'Seen' : 'Sent'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {!loading && messages.length === 0 && (
              <div className="chat-quick-messages" aria-label="Suggested messages">
                {QUICK_MESSAGES.map((message) => (
                  <button
                    key={message}
                    type="button"
                    className="chat-quick-message"
                    onClick={() => setText(message)}
                  >
                    {message}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="chat-footer">
              <input
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={2000}
                aria-label="Message"
              />
              <button type="submit" disabled={!text.trim() || sending}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
