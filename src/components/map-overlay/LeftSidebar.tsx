import { NavLink, useLocation } from 'react-router-dom';

export default function LeftSidebar() {
  const location = useLocation();
  
  const navItems = [
    { path: '/map', icon: 'fa-location-dot', title: 'Map' },
    { path: '/journey', icon: 'fa-route', title: 'Journey' },
    { path: '/network', icon: 'fa-users', title: 'Network' },
    { path: '/settings', icon: 'fa-gear', title: 'Settings' },
  ];

  return (
    <div className="absolute left-4 top-4 h-[calc(100vh-170px)] w-[60px] bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 flex flex-col items-center p-3 pointer-events-auto shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
      {/* Logo */}
      <div className="w-10 h-10 flex items-center justify-center">
        <img src="/images/logo.svg" alt="Logo" className="w-8 h-8 opacity-90" />
      </div>
      
      {/* Divider */}
      <div className="w-8 h-px bg-white/15 my-3" />
      
      {/* Navigation Icons */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === '/map' && location.pathname === '/');
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)]' 
                  : 'bg-transparent text-white/50 hover:bg-white/10 hover:text-white/80'
              }`}
              title={item.title}
            >
              <i className={`fa-solid ${item.icon}`}></i>
            </NavLink>
          );
        })}
      </nav>

      {/* Spacer to push logout to bottom */}
      <div className="flex-1" />

      {/* Logout at bottom */}
      <button 
        className="w-10 h-10 rounded-lg bg-white/5 text-white/40 flex items-center justify-center text-base cursor-pointer transition-all duration-200 hover:bg-white/10 hover:text-white/70"
        title="Exit"
      >
        <i className="fa-solid fa-arrow-right-from-bracket"></i>
      </button>
    </div>
  );
}
