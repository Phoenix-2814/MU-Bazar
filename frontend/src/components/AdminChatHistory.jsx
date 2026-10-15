import { useState } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight, MessageSquareText } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const formatTime = (value) => new Date(value).toLocaleString([], {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function AdminChatHistory({ listingId, listingTitle, sellerId, targetUserId, token }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messagesByConversation, setMessagesByConversation] = useState({});
  const [loadingConversations, setLoadingConversations] = useState({});
  const [error, setError] = useState('');

  const loadConversations = async () => {
    setLoadingThreads(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/reports/admin/listings/${listingId}/conversations`, {
        params: targetUserId ? { userId: targetUserId } : undefined,
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(response.data.conversations || []);
      setThreadsLoaded(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load product chats.');
    } finally {
      setLoadingThreads(false);
    }
  };

  const togglePanel = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !threadsLoaded && !loadingThreads) loadConversations();
  };

  const loadConversation = async (conversationId) => {
    setSelectedConversationId(conversationId);
    if (messagesByConversation[conversationId] || loadingConversations[conversationId]) return;
    setLoadingConversations((current) => ({ ...current, [conversationId]: true }));
    setError('');
    try {
      const allMessages = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const response = await axios.get(
          `${API_BASE_URL}/api/reports/admin/conversations/${conversationId}/messages`,
          { params: { offset, limit: 100 }, headers: { Authorization: `Bearer ${token}` } }
        );
        allMessages.push(...(response.data.messages || []));
        offset += response.data.messages?.length || 0;
        hasMore = response.data.pagination?.hasMore === true;
      }
      setMessagesByConversation((current) => ({ ...current, [conversationId]: allMessages }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the complete conversation.');
    } finally {
      setLoadingConversations((current) => ({ ...current, [conversationId]: false }));
    }
  };

  return (
    <section className="admin-chat-history">
      <button
        type="button"
        className="admin-chat-history-trigger"
        aria-expanded={expanded}
        onClick={togglePanel}
      >
        <MessageSquareText size={17} aria-hidden="true" />
        <span>View chats for {listingTitle}</span>
        {expanded ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
      </button>
      {expanded && (
        <div className="admin-chat-history-content">
          {error && <p className="report-error" role="alert">{error}</p>}
          {loadingThreads ? (
            <p className="admin-chat-history-empty">Loading conversations…</p>
          ) : conversations.length === 0 && threadsLoaded ? (
            <p className="admin-chat-history-empty">No conversations were started for this product.</p>
          ) : conversations.map((conversation) => {
            const seller = conversation.members?.find((member) => String(member._id) === String(sellerId));
            const buyer = conversation.members?.find((member) => String(member._id) !== String(sellerId));
            const selected = selectedConversationId === conversation._id;
            const messages = messagesByConversation[conversation._id];
            return (
              <article className="admin-chat-thread" key={conversation._id}>
                <button
                  type="button"
                  className="admin-chat-thread-heading"
                  aria-expanded={selected}
                  onClick={() => selected ? setSelectedConversationId('') : loadConversation(conversation._id)}
                >
                  <span>
                    <strong>{buyer?.name || buyer?.email || 'Buyer'}</strong>
                    <small>with {seller?.name || 'Seller'} · {conversation.messageCount} messages</small>
                  </span>
                  <time dateTime={conversation.updatedAt}>{formatTime(conversation.updatedAt)}</time>
                </button>
                {selected && (
                  <div className="admin-chat-transcript" aria-live="polite">
                    {loadingConversations[conversation._id] ? (
                      <p className="admin-chat-history-empty">Loading full conversation…</p>
                    ) : messages?.length ? messages.map((message) => (
                      <article className="admin-chat-message" key={message._id}>
                        <div>
                          <strong>{message.sender?.name || 'User'}</strong>
                          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        </div>
                        <p>{message.text}</p>
                      </article>
                    )) : messages ? (
                      <p className="admin-chat-history-empty">This conversation has no messages.</p>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
