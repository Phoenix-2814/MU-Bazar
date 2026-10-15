import { Activity, Archive, LayoutDashboard, PackageCheck, ShieldAlert, UsersRound } from 'lucide-react';

const adminSections = [
  { id: 'admin-dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'admin-reports', label: 'Reports', icon: ShieldAlert },
  { id: 'admin-users', label: 'Users', icon: UsersRound },
  { id: 'admin-sessions', label: 'Login activity', icon: Activity },
  { id: 'admin-hidden', label: 'Hidden products', icon: Archive },
  { id: 'admin-sold', label: 'Sold products', icon: PackageCheck },
];

export default function AdminNavigation({ activePage, setActivePage }) {
  return (
    <nav className="admin-navigation" aria-label="Admin sections">
      <div className="admin-navigation-heading">
        <span>ADMIN WORKSPACE</span>
        <strong>Manage MU Bazar</strong>
      </div>
      <div className="admin-navigation-links">
        {adminSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`admin-navigation-link${activePage === id ? ' is-active' : ''}`}
            aria-current={activePage === id ? 'page' : undefined}
            onClick={() => setActivePage(id)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
