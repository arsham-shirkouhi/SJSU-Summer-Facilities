import {
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  Package,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const staffTabs = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Inventory', icon: Package, to: '/inventory' },
  { label: 'Tasks', icon: CheckSquare, to: '/staff-todos' },
  { label: 'Events', icon: CalendarDays, to: '/events' },
]

const adminTabs = [
  { label: 'Overview', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Todos', icon: CheckSquare, to: '/admin-todos' },
  { label: 'Schedule', icon: CalendarDays, to: '/admin-schedule' },
  { label: 'Staff', icon: Users, to: '/admin-staff' },
  { label: 'Inventory', icon: Package, to: '/inventory' },
]

export default function BottomNav({ role = 'staff' }) {
  const tabs = role === 'admin' ? adminTabs : staffTabs

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 h-16 border-t-[2.5px] border-ink bg-cream">
      <div className="mx-auto flex h-full max-w-[1120px]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.to === '/dashboard'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center ${
                  isActive ? 'bg-ink text-white' : 'bg-transparent text-ink'
                }`
              }
            >
              <Icon size={20} />
              <span className="mt-[3px] text-[10px] font-bold uppercase">{tab.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
