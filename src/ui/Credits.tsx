import { tr, useLang } from '../text/i18n';

export function Credits({ leaving, onBack }: { leaving: boolean; onBack: () => void }) {
  useLang();
  return (
    <div className={`menu${leaving ? ' exit' : ''}`}>
      <div className="menu-card">
        <div className="menu-over">{tr('credits.heading')}</div>
        <h1 className="menu-title small">MANSION MYSTERY</h1>
        <div className="credits-body">
          <p>
            {tr('credits.art')}
            <br />
            <a href="https://www.kenney.nl" target="_blank" rel="noreferrer">
              www.kenney.nl
            </a>{' '}
            · Creative Commons Zero (CC0)
          </p>
          <p className="dim">{tr('credits.cc0')}</p>
          <p className="dim">{tr('credits.tag')}</p>
        </div>
        <nav className="menu-buttons">
          <button onClick={onBack}>{tr('menu.back')}</button>
        </nav>
      </div>
    </div>
  );
}
