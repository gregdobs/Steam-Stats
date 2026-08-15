// Three fixed, blurred, drifting aura blobs + a subtle grain overlay behind
// every page — mounted once at the app root so it never remounts on page nav.
export default function AuraBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
      <div style={{
        position: 'absolute', top: '-16%', left: '-6%', width: '58vw', height: '58vw', borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, var(--ss-aura-1), transparent 62%)',
        filter: 'blur(30px)', animation: 'ssDrift 28s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', top: '38%', right: '-12%', width: '50vw', height: '50vw', borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, var(--ss-aura-3), transparent 62%)',
        filter: 'blur(30px)', animation: 'ssDrift 36s ease-in-out infinite reverse',
      }} />
      <div style={{
        position: 'absolute', bottom: '-22%', left: '26%', width: '48vw', height: '48vw', borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, var(--ss-aura-2), transparent 60%)',
        filter: 'blur(30px)', animation: 'ssDrift 44s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px)',
        backgroundSize: '3px 3px', opacity: 'var(--ss-grain)',
      }} />
    </div>
  );
}
