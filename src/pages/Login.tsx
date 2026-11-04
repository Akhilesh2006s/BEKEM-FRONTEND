import { useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HardHat,
  Warehouse,
  Briefcase,
  ShoppingBag,
  ClipboardCheck,
  Crown,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket } from '@/lib/socket';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { LoginResponseDto } from '@afios/shared';
import { ROLE_LABELS, UserRole } from '@afios/shared';
import { getRoleHomePath } from '@/lib/rolePaths';
import { BRAND_TAGLINE, BRAND_COMPANY } from '@/lib/brand';
import { BekemLogo } from '@/components/brand/BekemLogo';
import { cn } from '@/lib/utils';

const DEMO_PASSWORD = 'Bekem@Demo2026!';

const DEMO_USERS = [
  { email: 'request@bekem.com', role: UserRole.SITE_INCHARGE, icon: HardHat, color: 'bg-site' },
  { email: 'storeincharge@bekem.com', role: UserRole.STORE_INCHARGE, icon: Warehouse, color: 'bg-store' },
  { email: 'pm@bekem.com', role: UserRole.PROJECT_MANAGER, icon: Briefcase, color: 'bg-pm' },
  { email: 'executive@bekem.com', role: UserRole.EXECUTIVE, icon: ShoppingBag, color: 'bg-executive' },
  { email: 'coordinator@bekem.com', role: UserRole.COORDINATOR, icon: ClipboardCheck, color: 'bg-coordinator' },
  { email: 'chairman@bekem.com', role: UserRole.CHAIRMAN, icon: Crown, color: 'bg-chairman' },
];

const showDemoLogins = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState(showDemoLogins ? 'request@bekem.com' : '');
  const [password, setPassword] = useState(showDemoLogins ? DEMO_PASSWORD : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: string } | null)?.from || null;

  const authenticate = useCallback(
    async (loginEmail: string, options?: { role?: UserRole; password?: string }) => {
      setLoading(true);
      setError('');
      try {
        const res = await api.post<LoginResponseDto>('/auth/login', {
          email: loginEmail,
          password: options?.password ?? password,
        });
        setAuth(res.data.user, res.data.tokens);
        connectSocket();
        const home = options?.role
          ? getRoleHomePath(options.role)
          : getRoleHomePath(res.data.user.role);
        navigate(from && !from.startsWith('/login') ? from : home, { replace: true });
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [from, navigate, password, setAuth]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void authenticate(email);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[42%] bg-surface-sidebar flex-col justify-between p-12">
        <BekemLogo variant="light" size="md" />
        <div className="max-w-md">
          <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight">
            {BRAND_TAGLINE}
          </h2>
          <p className="text-white/50 mt-5 text-[15px] leading-relaxed">
            Material requests, store allocation, procurement approvals, and purchase order
            governance for field and head office teams.
          </p>
          <div className="flex gap-3 mt-8">
            <div className="h-1 flex-1 rounded-full bg-bekem-accent" />
            <div className="h-1 flex-1 rounded-full bg-white/20" />
            <div className="h-1 flex-1 rounded-full bg-white/20" />
          </div>
        </div>
        <p className="text-xs text-white/30">© {new Date().getFullYear()} {BRAND_COMPANY}</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-white">
        <div className="w-full max-w-[440px]">
          <div className="lg:hidden mb-4">
            <BekemLogo size="md" />
          </div>

          <div className="panel p-8">
            <h1 className="text-xl font-extrabold text-ink">Welcome back</h1>
            <p className="text-sm text-ink-secondary mt-1 mb-3">
              Sign in with your organisation account
            </p>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-ink mb-1.5">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-ink mb-1.5">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
              {error && (
                <p className="text-sm text-danger bg-danger-light border border-danger/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </form>
          </div>

          {showDemoLogins && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-3 px-1">
                Quick login
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    disabled={loading}
                    data-demo-email={u.email}
                    data-demo-role={u.role}
                    onClick={() => {
                      setEmail(u.email);
                      void authenticate(u.email, { role: u.role, password: DEMO_PASSWORD });
                    }}
                    className="panel p-3 flex items-center gap-3 text-left hover:border-bekem-accent/40 transition-colors disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0',
                        u.color
                      )}
                    >
                      <u.icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="text-sm font-semibold text-ink leading-tight">
                      {ROLE_LABELS[u.role]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
