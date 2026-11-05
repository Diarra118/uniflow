import { Menu, Moon, Sun, LogOut, User } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useTheme } from '@/shared/hooks/useTheme'
import { ROLE_LABELS } from '@/shared/config/roleLabels'

export function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { appUser, signOut } = useAuth()
  const { toggleTheme, isDark } = useTheme()

  return (
    <header className="flex h-16 items-center justify-between border-b border-base-300 bg-base-100 px-4 md:px-6">
      <button
        className="btn btn-ghost btn-sm btn-circle lg:hidden"
        onClick={onMenuClick}
        aria-label="Ouvrir le menu"
      >
        <Menu size={20} />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        <button
          className="btn btn-ghost btn-sm btn-circle"
          onClick={toggleTheme}
          aria-label="Changer de thème"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {appUser && (
          <div className="dropdown dropdown-end">
            <button tabIndex={0} className="btn btn-ghost btn-sm gap-2 px-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-content">
                <User size={14} />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-medium leading-tight">{appUser.name}</p>
                <p className="text-[11px] leading-tight text-base-content/50">
                  {ROLE_LABELS[appUser.role]}
                </p>
              </div>
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content menu-sm z-10 mt-2 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
            >
              <li>
                <button onClick={() => signOut()} className="text-error">
                  <LogOut size={15} />
                  Se déconnecter
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  )
}
