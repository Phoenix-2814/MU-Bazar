import { useEffect, useState } from 'react';

const ListingImageControls = ({ title, activeIndex, imageCount, onSelectIndex }) => {
  if (imageCount <= 1) return null;
  return (
    <div className="listing-image-controls">
      <button
        type="button"
        aria-label={`Previous photo of ${title}`}
        onClick={() => onSelectIndex((activeIndex - 1 + imageCount) % imageCount)}
      >
        ‹
      </button>
      <span aria-live="polite">{activeIndex + 1} / {imageCount}</span>
      <button
        type="button"
        aria-label={`Next photo of ${title}`}
        onClick={() => onSelectIndex((activeIndex + 1) % imageCount)}
      >
        ›
      </button>
    </div>
  );
};

const ListingImage = ({ images, title }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const imageSources = Array.isArray(images) ? images.filter(Boolean) : [];
  const imageSourceKey = imageSources.join('\u0000');
  const [failedImages, setFailedImages] = useState({});
  const activeSrc = imageSources[activeIndex];
  const selectIndex = (nextIndex) => setActiveIndex(nextIndex);

  useEffect(() => {
    setActiveIndex(0);
    setFailedImages({});
  }, [imageSourceKey]);

  if (!activeSrc || failedImages[activeIndex]) {
    return (
      <div className="listing-image-fallback">
        <span role="img" aria-label={`${title}: image unavailable`}>
          {activeSrc ? 'Image unavailable' : 'No images available'}
        </span>
        <ListingImageControls
          title={title}
          activeIndex={activeIndex}
          imageCount={imageSources.length}
          onSelectIndex={selectIndex}
        />
      </div>
    );
  }

  return (
    <>
      <img
        src={activeSrc}
        alt={`${title} (${activeIndex + 1} of ${imageSources.length})`}
        onError={() => setFailedImages((failed) => ({ ...failed, [activeIndex]: true }))}
      />
      <ListingImageControls
        title={title}
        activeIndex={activeIndex}
        imageCount={imageSources.length}
        onSelectIndex={selectIndex}
      />
    </>
  );
};

export default ListingImage;
