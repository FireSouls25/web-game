import { MenuScene } from './MenuScene';
import { getLang, setLang, tr, useLang, type Lang } from '../text/i18n';

interface Props {
  leaving: boolean;
  onBack: () => void;
}

export function Settings({ leaving, onBack }: Props) {
  const lang = useLang();
  const pick = (l: Lang) => () => setLang(l);
  return (
    <div className={`menu${leaving ? ' exit' : ''}`}>
      <MenuScene />
      <div className="menu-card">
        <div className="menu-over">{tr('menu.over')}</div>
        <h1 className="menu-title small">MANSION MYSTERY</h1>
        <div className="menu-sub">{tr('settings.title')}</div>
        <div className="settings-body">
          <div className="settings-row">
            <span>{tr('settings.language')}</span>
            <div className="settings-langs" role="radiogroup" aria-label={tr('settings.language')}>
              <button
                role="radio"
                aria-checked={lang === 'en'}
                className={getLang() === 'en' ? 'on' : ''}
                onClick={pick('en')}
              >
                English
              </button>
              <button
                role="radio"
                aria-checked={lang === 'es'}
                className={getLang() === 'es' ? 'on' : ''}
                onClick={pick('es')}
              >
                Español
              </button>
            </div>
          </div>
          <div className="settings-note">{tr('settings.note')}</div>
        </div>
        <nav className="menu-buttons">
          <button onClick={onBack}>{tr('menu.back')}</button>
        </nav>
      </div>
    </div>
  );
}
