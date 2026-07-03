import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { useLocale } from '../../state/LocaleProvider';

interface Props {
  consultationId: string;
  initiator: boolean;
  onClose: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

type CallState = 'connecting' | 'connected' | 'ended' | 'error';

/**
 * Peer-to-peer video consultation over WebRTC. Socket.IO relays the SDP/ICE
 * signaling only; media flows directly between the two browsers. Works on the
 * LAN without any external TURN server (public STUN handles most NATs).
 */
export function VideoCall({ consultationId, initiator, onClose }: Props) {
  const { t } = useLocale();
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [state, setState] = useState<CallState>('connecting');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    const socket = getSocket();
    let closed = false;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        setState('error');
        return;
      }
      if (closed) {
        stream.getTracks().forEach((tk) => tk.stop());
        return;
      }
      localStream.current = stream;
      if (localRef.current) localRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((tk) => pc.addTrack(tk, stream));

      pc.ontrack = (e) => {
        if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
        setState('connected');
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('call:ice', { consultationId, candidate: e.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('connected');
        if (pc.connectionState === 'failed') setState('error');
      };

      if (initiator) {
        await makeOffer();
      } else {
        socket.emit('call:ready', { consultationId });
      }
    }

    async function makeOffer() {
      const pc = pcRef.current;
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', { consultationId, sdp: offer });
    }

    async function drainIce() {
      const pc = pcRef.current;
      if (!pc) return;
      for (const c of pendingIce.current) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
      pendingIce.current = [];
    }

    const onReady = () => {
      if (initiator) makeOffer();
    };
    const onOffer = async (payload: { consultationId: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.consultationId !== consultationId || initiator) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await drainIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { consultationId, sdp: answer });
    };
    const onAnswer = async (payload: { consultationId: string; sdp: RTCSessionDescriptionInit }) => {
      if (payload.consultationId !== consultationId || !initiator) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      await drainIce();
    };
    const onIce = async (payload: { consultationId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.consultationId !== consultationId) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingIce.current.push(payload.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        /* ignore */
      }
    };
    const onEnd = (payload: { consultationId: string }) => {
      if (payload.consultationId === consultationId) hangup(false);
    };

    socket.on('call:ready', onReady);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:end', onEnd);

    start();

    function hangup(notify: boolean) {
      if (notify) socket.emit('call:end', { consultationId });
      pcRef.current?.close();
      pcRef.current = null;
      localStream.current?.getTracks().forEach((tk) => tk.stop());
      setState('ended');
    }

    // expose hangup for the button via closure on unmount
    (window as unknown as { __garaHangup?: () => void }).__garaHangup = () => hangup(true);

    return () => {
      closed = true;
      socket.off('call:ready', onReady);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:end', onEnd);
      socket.emit('call:end', { consultationId });
      pcRef.current?.close();
      pcRef.current = null;
      localStream.current?.getTracks().forEach((tk) => tk.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId, initiator]);

  function toggleMic() {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }
  function toggleCam() {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">{t('video.title')}</span>
        <span className="text-xs text-slate-300">
          {state === 'connecting' && t('video.connecting')}
          {state === 'connected' && t('video.connected')}
          {state === 'error' && t('video.error')}
          {state === 'ended' && t('video.ended')}
        </span>
      </div>

      <div className="relative flex-1">
        <video ref={remoteRef} autoPlay playsInline className="h-full w-full bg-black object-cover" />
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-32 w-24 rounded-xl border-2 border-white/50 object-cover shadow-lg"
        />
        {state !== 'connected' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {state === 'error' ? t('video.errorHint') : t('video.waiting')}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-5">
        <button
          onClick={toggleMic}
          className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${micOn ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}
        >
          {micOn ? '🎤' : '🔇'}
        </button>
        <button
          onClick={() => {
            (window as unknown as { __garaHangup?: () => void }).__garaHangup?.();
            onClose();
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-2xl text-white"
        >
          📞
        </button>
        <button
          onClick={toggleCam}
          className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${camOn ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}
        >
          {camOn ? '📹' : '🚫'}
        </button>
      </div>
    </div>
  );
}
