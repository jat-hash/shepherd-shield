import { useCallback, useEffect, useRef, useState } from 'react';
import { DirectLink } from '@/lib/directLink';

export const LINK_PHASE = {
  IDLE: 'idle',
  STARTING: 'starting',
  SHOW_CODE: 'show_code',
  SCANNING: 'scanning',
  LINKED: 'linked',
};

function readableError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it for Shepherd Shield and try again.';
  }
  if (name === 'NotFoundError') return 'No microphone was found on this phone.';
  return err?.message || 'The link could not be opened.';
}

/**
 * Drives one direct phone-to-phone link: one phone starts it (shows a code),
 * the other joins (scans that code and shows a reply), and the first scans the
 * reply. Both then talk straight to each other.
 */
export default function useDirectLink() {
  const [phase, setPhase] = useState(LINK_PHASE.IDLE);
  const [role, setRole] = useState(null);
  const [myCode, setMyCode] = useState('');
  const [talking, setTalking] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [error, setError] = useState('');
  const [remoteStream, setRemoteStream] = useState(null);
  const linkRef = useRef(null);

  const teardown = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const fail = useCallback((err) => {
    teardown();
    setError(readableError(err));
    setPhase(LINK_PHASE.IDLE);
    setRole(null);
    setMyCode('');
    setConnectionState('new');
  }, [teardown]);

  const openLink = useCallback(async (nextRole) => {
    setError('');
    setTalking(false);
    setRemoteStream(null);
    setConnectionState('new');
    setPhase(LINK_PHASE.STARTING);
    setRole(nextRole);
    teardown();
    const link = new DirectLink({
      onConnectionState: (state) => {
        setConnectionState(state);
        if (state === 'connected') setPhase(LINK_PHASE.LINKED);
        if (state === 'failed') setError('The link dropped. Start a new link to reconnect.');
      },
      onRemoteStream: setRemoteStream,
    });
    linkRef.current = link;
    await link.open();
    return link;
  }, [teardown]);

  const startHost = useCallback(async () => {
    try {
      const link = await openLink('host');
      setMyCode(await link.hostCode());
      setPhase(LINK_PHASE.SHOW_CODE);
    } catch (err) {
      fail(err);
    }
  }, [openLink, fail]);

  const startGuest = useCallback(async () => {
    try {
      await openLink('guest');
      setPhase(LINK_PHASE.SCANNING);
    } catch (err) {
      fail(err);
    }
  }, [openLink, fail]);

  const submitCode = useCallback(async (code) => {
    const link = linkRef.current;
    if (!link || !code) return;
    try {
      setError('');
      setPhase(LINK_PHASE.STARTING);
      if (role === 'guest') {
        setMyCode(await link.joinCode(code));
        setPhase(LINK_PHASE.SHOW_CODE);
      } else {
        await link.acceptAnswer(code);
        setPhase(LINK_PHASE.LINKED);
      }
    } catch (err) {
      fail(err);
    }
  }, [role, fail]);

  const showScanner = useCallback(() => setPhase(LINK_PHASE.SCANNING), []);

  const startTalking = useCallback(() => {
    linkRef.current?.setTalking(true);
    setTalking(true);
  }, []);

  const stopTalking = useCallback(() => {
    linkRef.current?.setTalking(false);
    setTalking(false);
  }, []);

  const hangUp = useCallback(() => {
    teardown();
    setPhase(LINK_PHASE.IDLE);
    setRole(null);
    setMyCode('');
    setRemoteStream(null);
    setTalking(false);
    setConnectionState('new');
    setError('');
  }, [teardown]);

  return {
    phase,
    role,
    myCode,
    talking,
    connectionState,
    error,
    remoteStream,
    startHost,
    startGuest,
    showScanner,
    submitCode,
    startTalking,
    stopTalking,
    hangUp,
  };
}