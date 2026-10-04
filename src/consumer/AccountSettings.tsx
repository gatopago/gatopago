import { NavigationLink as Link } from './NavigationLink';
import { SettingsSection } from './SettingsSection';
import { BackIcon, SecurityIcon, HomeIcon } from './Icons';

export function AccountSettings({ english: en }: { english: boolean }) {
  const suffix = en ? '?lang=en' : '';
  return (
    <>
      <header className="mb-7 flex items-center gap-3">
        <Link
          href={`/app${suffix}`}
          replace
          className="meli-square-action h-11 w-11"
          aria-label={en ? 'Back to my account' : 'Volver a mi cuenta'}
        >
          <BackIcon />
        </Link>
        <h1 className="text-[22px]">{en ? 'Settings' : 'Ajustes'}</h1>
      </header>
      <SettingsSection title={en ? 'Security' : 'Seguridad'} tone="pending" icon={<SecurityIcon />}>
        <div className="p-5">
          <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
            {en
              ? 'Access keys, optional backups and account control.'
              : 'Llaves de acceso, respaldos opcionales y control de tu cuenta.'}
          </p>
          <Link href={`/settings/security${suffix}`} className="btn btn-primary btn-block">
            {en ? 'Your security center' : 'Tu centro de seguridad'}
          </Link>
        </div>
      </SettingsSection>
      <SettingsSection title={en ? 'Your account' : 'Tu cuenta'} tone="neutral" icon={<HomeIcon />}>
        <div className="flex flex-col gap-3 p-5">
          <Link href={`/profile${suffix}`} className="btn btn-ghost btn-block">
            {en ? 'My profile' : 'Mi perfil'}
          </Link>
        </div>
      </SettingsSection>
      <SettingsSection
        title={en ? 'Language' : 'Idioma'}
        tone="neutral"
        icon={<span aria-hidden="true">◎</span>}
      >
        <div className="p-5">
          <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
            {en ? 'Choose the app language.' : 'Elige el idioma de la app.'}
          </p>
          <nav
            className="grid grid-cols-2 gap-1 border border-border p-1"
            aria-label={en ? 'App language' : 'Idioma de la app'}
          >
            <Link
              href="/settings"
              replace
              aria-current={!en ? 'page' : undefined}
              className={`min-h-11 p-3 text-center font-semibold ${!en ? 'bg-cat-500 text-on-cat' : 'text-text-muted'}`}
            >
              Español
            </Link>
            <Link
              href="/settings?lang=en"
              replace
              aria-current={en ? 'page' : undefined}
              className={`min-h-11 p-3 text-center font-semibold ${en ? 'bg-cat-500 text-on-cat' : 'text-text-muted'}`}
            >
              English
            </Link>
          </nav>
        </div>
      </SettingsSection>
    </>
  );
}
