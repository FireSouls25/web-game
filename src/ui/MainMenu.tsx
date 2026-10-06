import { MenuScene } from './MenuScene';
import { tr, useLang } from '../text/i18n';

interface Props {
  hasSave: boolean;
  leaving: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onCredits: () => void;
  onSettings: () => void;
  onFullscreen: () => void;
}

export function MainMenu({
  hasSave,
  leaving,
  onNewGame,
  onContinue,
  onCredits,
  onSettings,
  onFullscreen,
}: Props) {
  useLang();
  return (
    <div className={`menu${leaving ? ' exit' : ''}`}>
      <MenuScene />
      <div className="menu-card">
        {/* The title is never translated (see settings note). */}
        <h1 className="menu-title">MANSION MYSTERY</h1>
        <nav className="menu-buttons">
          <button onClick={onNewGame} autoFocus>
            {tr('menu.new')}
          </button>
          {hasSave && <button onClick={onContinue}>{tr('menu.continue')}</button>}
          <button onClick={onSettings}>{tr('menu.settings')}</button>
          <button onClick={onCredits}>{tr('menu.credits')}</button>
          <button onClick={onFullscreen} className="ghost">
            {tr('menu.fullscreen')}
          </button>
        </nav>
      </div>
    </div>
  );
}
