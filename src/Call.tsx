import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Maximize2,
} from "lucide-react";
import { api } from "./api";
import type { Profile } from "./types";
type Peer = { peer_id: string; profile: Profile; stream?: MediaStream };
function Tile({ peer, muted = false }: { peer: Peer; muted?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (video.current) video.current.srcObject = peer.stream || null;
  }, [peer.stream]);
  useEffect(() => {
    if (!peer.stream?.getAudioTracks().length) return;
    const ctx = new AudioContext(),
      analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(peer.stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(data);
      setSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 10);
    }, 150);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [peer.stream]);
  return (
    <div className={"call-tile " + (speaking ? "speaking" : "")}>
      <div className={"avatar large " + peer.profile.color}>
        {peer.profile.display_name.slice(0, 1)}
      </div>
      <video ref={video} autoPlay playsInline muted={muted} />
      <span>
        {peer.profile.display_name}
        {speaking ? " · Speaking" : ""}
      </span>
    </div>
  );
}
export default function Call({
  socket,
  room,
  user,
  onLeave,
  onError,
}: {
  socket: Socket;
  room: { id: string; name: string };
  user: Profile;
  onLeave: () => void;
  onError: (s: string) => void;
}) {
  const [peers, setPeers] = useState<Peer[]>([]),
    [local, setLocal] = useState<MediaStream>(),
    [muted, setMuted] = useState(false),
    [deaf, setDeaf] = useState(false),
    [camera, setCamera] = useState(false),
    [sharing, setSharing] = useState(false),
    [connected, setConnected] = useState(false);
  const pcs = useRef(new Map<string, RTCPeerConnection>()),
    stream = useRef<MediaStream | undefined>(undefined),
    screen = useRef<MediaStream | undefined>(undefined),
    ice = useRef<RTCIceServer[]>([]),
    pending = useRef(new Map<string, RTCIceCandidateInit[]>()),
    active = useRef(true),
    generation = useRef(0),
    remoteStreams = useRef(new Map<string, MediaStream>());
  const emit = (event: string, data: any) =>
    new Promise<any>((resolve, reject) =>
      socket
        .timeout(10000)
        .emit(event, data, (err: any, r: any) =>
          err || r?.error
            ? reject(Error(r?.error || "Connection timed out."))
            : resolve(r),
        ),
    );
  function peerConnection(pid: string, profile: Profile) {
    let pc = pcs.current.get(pid);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(pid, pc);
    stream.current
      ?.getAudioTracks()
      .forEach((t) => pc!.addTrack(t, stream.current!));
    const visual =
      screen.current?.getVideoTracks()[0] ||
      stream.current?.getVideoTracks()[0];
    if (visual) pc.addTrack(visual, screen.current || stream.current!);
    else pc.addTransceiver("video", { direction: "sendrecv" });
    pc.onicecandidate = (e) => {
      if (e.candidate)
        void emit("voice:signal", {
          to: pid,
          candidate: e.candidate.toJSON(),
        }).catch(() => {});
    };
    pc.ontrack = (e) => {
      const media = remoteStreams.current.get(pid) || new MediaStream();
      if (!media.getTracks().some((t) => t.id === e.track.id))
        media.addTrack(e.track);
      remoteStreams.current.set(pid, media);
      setPeers((prev) => [
        ...prev.filter((p) => p.peer_id !== pid),
        { peer_id: pid, profile, stream: media },
      ]);
    };
    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === "failed")
        onError(
          "A peer connection failed. A TURN server may be needed on this network.",
        );
    };
    setPeers((prev) =>
      prev.some((p) => p.peer_id === pid)
        ? prev
        : [...prev, { peer_id: pid, profile }],
    );
    return pc;
  }
  useEffect(() => {
    active.current = true;
    const attempt = ++generation.current;
    const signal = async ({ from, description, candidate, profile }: any) => {
      try {
        const pc = peerConnection(from, profile);
        if (description) {
          await pc.setRemoteDescription(description);
          for (const c of pending.current.get(from) || [])
            await pc.addIceCandidate(c);
          pending.current.delete(from);
          if (description.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            await emit("voice:signal", {
              to: from,
              description: pc.localDescription,
            });
          }
        } else if (candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(candidate);
          else
            pending.current.set(from, [
              ...(pending.current.get(from) || []),
              candidate,
            ]);
        }
      } catch (e) {
        onError((e as Error).message);
      }
    };
    const left = ({ peer_id }: any) => {
      pcs.current.get(peer_id)?.close();
      pcs.current.delete(peer_id);
      setPeers((p) => p.filter((x) => x.peer_id !== peer_id));
    };
    const lost = () => {
      onError("The connection was lost. Rejoin the call when connected.");
      onLeave();
    };
    (async () => {
      try {
        const config = await api("/rtc");
        ice.current = config.iceServers;
        const media = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!active.current || attempt !== generation.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        setLocal(media);
        socket.on("voice:signal", signal);
        socket.on("voice:left", left);
        socket.on("disconnect", lost);
        const joined = await emit("voice:join", { room_id: room.id });
        if (!active.current || attempt !== generation.current) return;
        setConnected(true);
        for (const p of joined.peers) {
          const pc = peerConnection(p.peer_id, p.profile);
          await pc.setLocalDescription(await pc.createOffer());
          await emit("voice:signal", {
            to: p.peer_id,
            description: pc.localDescription,
          });
        }
      } catch (e) {
        onError((e as Error).message);
        onLeave();
      }
    })();
    return () => {
      active.current = false;
      generation.current++;
      socket.emit("voice:leave", {});
      socket.off("voice:signal", signal);
      socket.off("voice:left", left);
      socket.off("disconnect", lost);
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      stream.current?.getTracks().forEach((t) => t.stop());
      screen.current?.getTracks().forEach((t) => t.stop());
    };
  }, [room.id]);
  function toggleMic() {
    const next = !muted;
    stream.current
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !next && !deaf));
    setMuted(next);
  }
  function toggleDeaf() {
    const next = !deaf;
    stream.current
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !next && !muted));
    setDeaf(next);
  }
  async function replaceVideo(track: MediaStreamTrack | null) {
    for (const pc of pcs.current.values()) {
      const sender = pc
        .getTransceivers()
        .find((t) => t.receiver.track.kind === "video")?.sender;
      if (sender) await sender.replaceTrack(track);
    }
  }
  async function toggleCamera() {
    try {
      if (camera) {
        stream.current?.getVideoTracks().forEach((t) => {
          t.stop();
          stream.current?.removeTrack(t);
        });
        if (!sharing) await replaceVideo(null);
        setCamera(false);
      } else {
        const m = await navigator.mediaDevices.getUserMedia({ video: true });
        const t = m.getVideoTracks()[0];
        stream.current?.addTrack(t);
        if (!sharing) await replaceVideo(t);
        setCamera(true);
      }
      setLocal(new MediaStream(stream.current?.getTracks() || []));
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function stopScreen() {
    screen.current?.getTracks().forEach((t) => t.stop());
    screen.current = undefined;
    await replaceVideo(stream.current?.getVideoTracks()[0] || null);
    setSharing(false);
    setLocal(new MediaStream(stream.current?.getTracks() || []));
  }
  async function toggleScreen() {
    try {
      if (sharing) return await stopScreen();
      const m = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screen.current = m;
      m.getVideoTracks()[0].onended = () => void stopScreen();
      await replaceVideo(m.getVideoTracks()[0]);
      setSharing(true);
      setLocal(
        new MediaStream([
          ...m.getVideoTracks(),
          ...(stream.current?.getAudioTracks() || []),
        ]),
      );
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <div className="call-panel">
      <div className="call-heading">
        <span className="live-dot" />{" "}
        {connected ? "Voice connected" : "Connecting…"}{" "}
        <strong>{room.name}</strong>
        <span>{peers.length + 1} / 6</span>
      </div>
      <div className="call-grid">
        <Tile peer={{ peer_id: "self", profile: user, stream: local }} muted />
        {peers.map((p) => (
          <Tile key={p.peer_id} peer={p} muted={deaf} />
        ))}
      </div>
      <div className="call-controls">
        <button
          aria-label="Toggle microphone"
          className={muted ? "danger" : ""}
          onClick={toggleMic}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button aria-label="Toggle deafen" onClick={toggleDeaf}>
          {deaf ? <HeadphoneOff /> : <Headphones />}
        </button>
        <button
          aria-label="Toggle camera"
          className={camera ? "selected" : ""}
          onClick={toggleCamera}
        >
          {camera ? <Video /> : <VideoOff />}
        </button>
        <button
          aria-label="Share screen"
          className={sharing ? "selected" : ""}
          onClick={toggleScreen}
        >
          <MonitorUp />
        </button>
        <button className="danger" aria-label="Leave call" onClick={onLeave}>
          <PhoneOff />
        </button>
        <button
          aria-label="Expand call"
          onClick={() =>
            document
              .querySelector(".call-panel")
              ?.requestFullscreen()
              .catch(() => {})
          }
        >
          <Maximize2 />
        </button>
      </div>
    </div>
  );
}
