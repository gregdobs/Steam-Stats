import { useState, useEffect } from 'react';
import { useApp } from '../hooks/useAppContext.jsx';
import { formatHours, formatLastPlayed, minutesToHours, getCompletionStatus, fetchAchievementRarity,
  loadSteamLinkPref, shouldUseSteamApp, steamStoreUrl } from '../utils/steam.js';
import { GameHeader } from './GameImage.jsx';
import DetailSheet from './DetailSheet.jsx';

const STATUS_COLOR = {
  'Barely Started': 'var(--ss-ink3)',
  'In Progress':    'var(--ss-accent)',
  'Getting There':  'var(--ss-cat-4)',
  'Completed':      'var(--ss-cat-3)',
  'Overplayer':     'var(--ss-cat-2)',
};

// game detail — renders inside a slide-in DetailSheet, or inline (no sheet
// chrome) when embedded directly in another surface, e.g. Settings' games list.
export default function GameDetailPanel({ game, onClose, achData, hltbData, anchorRect, inline }) {
  const { ownedGames, recentGames, localConfig } = useApp();
  const [rarity, setRarity] = useState(null);

  // Read at render rather than held in state: the panel remounts each time
  // it's opened, so it always reflects the current Settings choice.
  const useSteamApp = shouldUseSteamApp(loadSteamLinkPref(), localConfig?.found);
  const storeUrl = steamStoreUrl(game.appid, useSteamApp);

  // Global unlock rate for this game's achievements, scoped to a single
  // appid — same fetchAchievementRarity used by the Rarest Unlocks widget,
  // just called for whichever game's sheet happens to be open.
  useEffect(() => {
    setRarity(null);
    if (!game?.appid || !achData?.earnedDetails?.length) return;
    let cancelled = false;
    fetchAchievementRarity([game.appid]).then(result => {
      if (!cancelled) setRarity(result[game.appid] || null);
    });
    return () => { cancelled = true; };
  }, [game?.appid, achData?.earnedDetails?.length]);

  if (!game) return null;

  const allTimeMinutes = game.playtime_forever || 0;
  const periodMinutes  = game.playtime_2weeks   || 0;
  const totalLibMin    = ownedGames.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const totalPeriodMin = recentGames.reduce((s, g) => s + (g.playtime_2weeks  || 0), 0);

  const allTimeHours = minutesToHours(allTimeMinutes);
  const libraryPct   = totalLibMin   > 0 ? Math.round((allTimeMinutes / totalLibMin)    * 100) : 0;
  const periodPct    = totalPeriodMin > 0 ? Math.round((periodMinutes  / totalPeriodMin) * 100) : 0;
  const avgSession   = game.launchCount && allTimeMinutes ? parseFloat((allTimeMinutes / 60 / game.launchCount).toFixed(1)) : null;
  const lastPlayed   = game.localLastPlayed || game.rtime_last_played;

  const rank = [...ownedGames]
    .filter(g => g.playtime_forever > 0)
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .findIndex(g => g.appid === game.appid) + 1;

  const hltbMain        = hltbData?.mainStory;
  const completionStatus = hltbMain ? getCompletionStatus(allTimeHours, hltbMain) : null;
  const completionPct   = hltbMain ? Math.min(Math.round((allTimeHours / hltbMain) * 100), 200) : null;

  const earned     = achData?.earned    ?? null;
  const achTotal   = achData?.total     ?? null;
  const achPct     = achData?.pct       ?? null;
  const lastUnlock = achData?.lastUnlockTime;

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header image */}
      <div style={{ height: 150, background: 'var(--ss-inset)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <GameHeader appId={game.appid} name={game.name} />
        <div style={{ position: 'absolute', inset: 0, background: 'var(--ss-scrim)' }} />
        {!inline && (
          <button
            onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'var(--ss-btn)', border: '1px solid var(--ss-line)', color: 'var(--ss-ink)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}
          >✕</button>
        )}
        {rank > 0 && (
          <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 11, fontWeight: 600, color: 'var(--ss-ink2)' }}>
            #{rank} in library
          </div>
        )}
        {completionStatus && (
          <div style={{ position: 'absolute', bottom: 12, right: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: 'var(--ss-inset)', border: '1px solid var(--ss-line)', color: STATUS_COLOR[completionStatus.label] || 'var(--ss-ink)' }}>
              {completionStatus.icon} {completionStatus.label}
            </span>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 17, fontWeight: 600, color: 'var(--ss-ink)', lineHeight: 1.3, maxWidth: '80%' }}>
          {rank > 0 ? null : game.name}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ss-ink)', lineHeight: 1.3 }}>
          {game.name}
        </div>

        {/* Period ring */}
        {periodMinutes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
              <svg viewBox="0 0 50 50" width={50} height={50}>
                <circle cx={25} cy={25} r={19} fill="none" stroke="var(--ss-track)" strokeWidth={5} />
                <circle cx={25} cy={25} r={19} fill="none" stroke="var(--ss-accent)" strokeWidth={5}
                  strokeDasharray={`${2*Math.PI*19*Math.min(periodPct,100)/100} ${2*Math.PI*19}`}
                  strokeLinecap="round" transform="rotate(-90 25 25)"
                  style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--ss-accent)' }}>
                {periodPct}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>Period share</div>
              <div style={{ fontSize: 12.5, color: 'var(--ss-ink2)' }}>{periodPct}% of gaming time</div>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            periodMinutes > 0 && { label: 'This Period', value: formatHours(periodMinutes), color: 'var(--ss-accent)' },
            { label: 'All Time',    value: formatHours(allTimeMinutes),       color: 'var(--ss-ink2)' },
            avgSession &&       { label: 'Avg Session', value: `${avgSession}h`,            color: 'var(--ss-cat-3)' },
            game.launchCount && { label: 'Launches',    value: `${game.launchCount}×`,      color: 'var(--ss-ink2)' },
            { label: '% Library',   value: `${libraryPct}%`,                  color: 'var(--ss-cat-4)' },
            lastPlayed &&       { label: 'Last Played', value: formatLastPlayed(lastPlayed), color: 'var(--ss-ink3)' },
          ].filter(Boolean).slice(0, 6).map(s => (
            <div key={s.label} style={{ padding: '9px 11px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)' }}>
              <div style={{ fontSize: 10, color: 'var(--ss-ink3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Library % bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--ss-ink3)' }}>Share of your lifetime hours</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ss-cat-4)' }}>{libraryPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(libraryPct * 5, 100)}%`, background: 'var(--ss-cat-4)', transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ss-ink4)', marginTop: 4 }}>
            {formatHours(allTimeMinutes)} of {formatHours(totalLibMin)} total
          </div>
        </div>

        {/* HLTB */}
        {hltbData && !hltbData.error && hltbMain && (
          <div style={{ padding: '11px 13px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>HowLongToBeat</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {hltbData.mainStory    && <div><div style={{ fontSize: 9.5, color: 'var(--ss-ink4)', textTransform: 'uppercase' }}>Main</div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ss-ink)' }}>{hltbData.mainStory}h</div></div>}
              {hltbData.mainExtra    && <div><div style={{ fontSize: 9.5, color: 'var(--ss-ink4)', textTransform: 'uppercase' }}>+Extra</div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ss-ink2)' }}>{hltbData.mainExtra}h</div></div>}
              {hltbData.completionist && <div><div style={{ fontSize: 9.5, color: 'var(--ss-ink4)', textTransform: 'uppercase' }}>100%</div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ss-ink2)' }}>{hltbData.completionist}h</div></div>}
            </div>
            {completionPct !== null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--ss-ink3)' }}>Your completion</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: completionPct >= 100 ? 'var(--ss-cat-3)' : 'var(--ss-accent)' }}>{completionPct > 200 ? '200%+' : `${completionPct}%`}</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(completionPct, 100)}%`, background: completionPct >= 100 ? 'var(--ss-cat-3)' : completionPct >= 75 ? 'var(--ss-cat-4)' : 'var(--ss-accent)' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Achievements */}
        {achTotal > 0 && earned !== null && (
          <div style={{ padding: '11px 13px', background: 'var(--ss-inset)', borderRadius: 14, border: '1px solid var(--ss-line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Achievements</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: achPct === 100 ? 'var(--ss-cat-3)' : 'var(--ss-accent)' }}>{earned}/{achTotal} · {achPct}%</div>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--ss-track)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${achPct ?? 0}%`, background: achPct === 100 ? 'var(--ss-cat-3)' : achPct >= 75 ? 'var(--ss-cat-4)' : 'var(--ss-accent)' }} />
            </div>
            {lastUnlock > 0 && <div style={{ fontSize: 10, color: 'var(--ss-ink4)' }}>Last unlock: {formatLastPlayed(lastUnlock)}</div>}
          </div>
        )}

        {/* Recent unlocks with global rate% */}
        {rarity && achData?.earnedDetails?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--ss-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Recent unlocks</div>
            {[...achData.earnedDetails]
              .filter(a => a.unlocktime)
              .sort((a, b) => b.unlocktime - a.unlocktime)
              .slice(0, 5)
              .map(a => {
                const percent = rarity[a.apiname];
                return (
                  <div key={a.apiname} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--ss-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.displayName}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ss-ink4)', flexShrink: 0 }}>{formatLastPlayed(a.unlocktime)}</span>
                    {percent != null && (
                      <span style={{ fontSize: 10.5, color: 'var(--ss-cat-2)', flexShrink: 0, width: 40, textAlign: 'right' }}>
                        {percent < 1 ? percent.toFixed(1) : Math.round(percent)}%
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Tags */}
        {game.userTags?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {game.userTags.map(tag => (
              <span key={tag} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--ss-pill-bg)', border: '1px solid var(--ss-pill-line)', color: 'var(--ss-pill-ink)', fontWeight: 500 }}>{tag}</span>
            ))}
          </div>
        )}

        {/* Steam store link — opens in the Steam desktop client when one was
            detected, unless the user has overridden that in Settings. */}
        {storeUrl && (
          <a href={storeUrl} target="_blank" rel="noopener noreferrer"
            className="ss-pill"
            style={{ justifyContent: 'center', textDecoration: 'none' }}
          >
            {useSteamApp ? 'View in Steam ↗' : 'View on Steam Store ↗'}
          </a>
        )}
      </div>
    </div>
  );

  if (inline) {
    return <div style={{ animation: 'ssFade 0.22s ease' }}>{content}</div>;
  }

  return (
    <DetailSheet open={!!game} onClose={onClose} anchorRect={anchorRect}>
      {content}
    </DetailSheet>
  );
}
