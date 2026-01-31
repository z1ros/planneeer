interface LeftSidebarProps {
  activeNav: 'places' | 'landmarks' | 'settings';
  onNavClick: (nav: 'places' | 'landmarks' | 'settings') => void;
}

export default function LeftSidebar({ activeNav, onNavClick }: LeftSidebarProps) {
  const navItems = [
    { id: 'places' as const, icon: 'fa-location-dot', label: 'Places' },
    { id: 'landmarks' as const, icon: 'fa-train-subway', label: 'Transit' },
    { id: 'settings' as const, icon: 'fa-gear', label: 'Settings' },
  ];

  return (
    <div className="absolute left-4 top-4 pointer-events-auto z-50">
      <div className="bg-[#1a1a2e]/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10">
        {/* Logo */}
        <div className="p-3 flex items-center justify-center border-b border-white/10">
          <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center">
            <i className="fa-solid fa-trident text-white text-lg"></i>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavClick(item.id)}
              className={`
                w-full flex items-center justify-center p-3 rounded-xl transition-all duration-200
                ${activeNav === item.id 
                  ? 'bg-orange-500 text-white' 
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }
              `}
            >
              <i className={`fa-solid ${item.icon} text-lg`}></i>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
