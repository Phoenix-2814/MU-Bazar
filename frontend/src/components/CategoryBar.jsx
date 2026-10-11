import { CATEGORY_OPTIONS } from '../config';

export default function CategoryBar({
  selectedCategory,
  setSelectedCategory,
  setTheme,
  theme,
}) {
  return (
    <nav className="category-bar" aria-label="Listing categories">
      <div className="category-options">
        {CATEGORY_OPTIONS.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`cat-btn ${selectedCategory === cat.key ? 'active' : ''}`}
            aria-pressed={selectedCategory === cat.key}
            onClick={() => setSelectedCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="theme-toggle"
        role="switch"
        aria-label="Dark mode"
        aria-checked={theme === 'dark'}
        onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
      >
        <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-thumb" />
        </span>
      </button>
    </nav>
  );
}
