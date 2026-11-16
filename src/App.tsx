import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  Hash,
  Volume2,
  ChevronDown,
  ChevronRight,
  Plus,
  Compass,
  MessageCircle,
  Users,
  Bell,
  Search,
  Pin,
  Inbox,
  HelpCircle,
  Mic,
  Headphones,
  Settings,
  Smile,
  Send,
  Paperclip,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
  LogOut,
  Shield,
  Globe,
  Gamepad2,
  Palette,
  Code2,
  Sparkles,
  Megaphone,
  Copy,
  Reply,
  MoreHorizontal,
  Trash2,
  Pencil,
  Flag,
  UserPlus,
  Video,
  Menu,
  CheckCheck,
  ExternalLink,
  Lock,
  Download,
  Heart,
  Zap,
  Radio,
} from "lucide-react";
import { api, post, patch, remove, API } from "./api";
import {
  previewPeople,
  previewCommunities,
  previewChannels,
  previewMessages,
} from "./preview";
import type {
  Profile,
  Community,
  Channel,
  Message,
  Member,
  Conversation,
  Notification,
  Attachment,
} from "./types";
import Call from "./Call";
import AuthPage from "./AuthPage";

const icons: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  palette: Palette,
  gamepad: Gamepad2,
  code: Code2,
};
function Avatar({
  profile,
  size = "",
  onClick,
}: {
  profile: Profile;
  size?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      title={profile.display_name}
      className={"avatar " + profile.color + " " + size}
      onClick={onClick}
    >
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt="" />
      ) : (
        profile.display_name
          .split(" ")
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
      )}
      <i className={"status " + profile.status} />
    </Tag>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <button
        className="modal-close icon-button"
        onClick={close}
        aria-label="Close dialog"
      >
        <X />
      </button>
      <h2>{title}</h2>
      {subtitle && <p className="modal-subtitle">{subtitle}</p>}
      {children}
    </dialog>
  );
}
const labels = {
  en: {
    home: "Home",
    discover: "Discover",
    friends: "Friends",
    messages: "Direct messages",
    text: "TEXT CHANNELS",
    voice: "VOICE CHANNELS",
    invite: "Invite people",
    general: "general",
    members: "MEMBERS",
    online: "ONLINE",
    offline: "OFFLINE",
    send: "Message",
    welcome: "You belong here.",
    welcomeSub: "Good conversations. Great people. Your own little universe.",
    edit: "Edit profile",
    settings: "Your settings",
  },
  ta: {
    home: "முகப்பு",
    discover: "கண்டறி",
    friends: "நண்பர்கள்",
    messages: "தனிப்பட்ட செய்திகள்",
    text: "உரை சேனல்கள்",
    voice: "குரல் சேனல்கள்",
    invite: "நண்பர்களை அழை",
    general: "பொது",
    members: "உறுப்பினர்கள்",
    online: "இணையத்தில்",
    offline: "இணைப்பில் இல்லை",
    send: "செய்தி",
    welcome: "இது உங்கள் இடம்.",
    welcomeSub: "நல்ல உரையாடல்கள். இனிய நண்பர்கள். உங்களுக்கான உலகம்.",
    edit: "சுயவிவரத்தைத் திருத்து",
    settings: "உங்கள் அமைப்புகள்",
  },
};
export default function App() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null),
    [admin, setAdmin] = useState(false),
    [serverMode, setServerMode] = useState("loading"),
    [communities, setCommunities] = useState<Community[]>(previewCommunities),
    [channels, setChannels] = useState<Channel[]>(previewChannels),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [communityId, setCommunityId] = useState("hq"),
    [roomId, setRoomId] = useState("hq-general"),
    [messages, setMessages] = useState<Message[]>(previewMessages),
    [members, setMembers] = useState<Member[]>(
      previewPeople.map((p) => ({
        id: p.id,
        user_id: p.id,
        role_id: null,
        profile: p,
      })),
    ),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const [incomingCall, setIncomingCall] = useState<{
    room: { id: string; name: string };
    caller: string;
  } | null>(null);
  const [view, setView] = useState("chat"),
    [modal, setModal] = useState(""),
    [selectedUser, setSelectedUser] = useState<Profile | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [reply, setReply] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null),
    [attachment, setAttachment] = useState<Attachment | null>(null),
    [emojiPicker, setEmojiPicker] = useState(false),
    [showMembers, setShowMembers] = useState(true),
    [mobileNav, setMobileNav] = useState(false),
    [typing, setTyping] = useState<
      Record<string, { name: string; at: number }>
    >({}),
    [readBy, setReadBy] = useState<string[]>([]),
    [call, setCall] = useState<{ id: string; name: string } | null>(null),
    [socket, setSocket] = useState<Socket | null>(null),
    [lang, setLang] = useState<"en" | "ta">(
      (localStorage.getItem("nexora-language") as "en" | "ta") || "en",
    ),
    [theme, setTheme] = useState(
      localStorage.getItem("nexora-theme") || "midnight",
    );
  const [discovery, setDiscovery] = useState<Community[]>(previewCommunities),
    [category, setCategory] = useState("All"),
    [friendList, setFriendList] = useState<any[]>([]),
    [blockList, setBlockList] = useState<any[]>([]),
    [roles, setRoles] = useState<any[]>([]),
    [adminData, setAdminData] = useState<any>(null),
    [inviteUrl, setInviteUrl] = useState(""),
    [reportMessage, setReportMessage] = useState<Message | null>(null),
    [loadingMessages, setLoadingMessages] = useState(false);
  const bottom = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    textInput = useRef<HTMLTextAreaElement>(null),
    roomRef = useRef(roomId),
    lastTyping = useRef(0);
  roomRef.current = roomId;
  const preview = !user,
    t = labels[lang],
    me = user || previewPeople[0],
    community = communities.find((c) => c.id === communityId),
    channel = channels.find((c) => c.id === roomId),
    conversation = conversations.find((c) => c.id === roomId),
    roomName = channel?.name || conversation?.name || "general";
  const notify = (s: string) => setToast(s),
    close = () => {
      setModal("");
      setError("");
      setInviteUrl("");
    },
    open = (name: string) => {
      setError("");
      setModal(name);
    },
    requireAuth = () => {
      if (!user) {
        open("login");
        return false;
      }
      return true;
    };
  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh(preferred?: string) {
    const d = await api("/bootstrap");
    setCommunities(d.communities);
    setChannels(d.channels);
    setConversations(d.conversations);
    setNotifications(d.notifications);
    const cid =
      preferred ||
      d.communities.find((c: Community) => c.id === communityId)?.id ||
      d.communities[0]?.id;
    setCommunityId(cid || "");
    if (
      (!d.channels.some((c: Channel) => c.id === roomRef.current) &&
        !d.conversations.some((c: Conversation) => c.id === roomRef.current)) ||
      preferred
    ) {
      setRoomId(
        d.channels.find(
          (c: Channel) => c.community_id === cid && c.kind === "text",
        )?.id || "",
      );
    }
    if (!cid && !d.conversations.length) setView("discover");
  }
  async function signedIn(p: Profile) {
    setUser(p);
    close();
    setMessages([]);
    setMembers([]);
    setView("chat");
    await refresh();
    const q = new URLSearchParams(location.search);
    if (q.has("invite")) {
      const result = await post("/invites/" + q.get("invite"));
      history.replaceState({}, "", location.pathname);
      await refresh(result.community_id);
      notify("Welcome to the community!");
    }
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const resized = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    const escaped = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        setMessageMenu(null);
      }
    };
    media.addEventListener("change", resized);
    window.addEventListener("keydown", escaped);
    return () => {
      media.removeEventListener("change", resized);
      window.removeEventListener("keydown", escaped);
    };
  }, []);
  useEffect(() => {
    void api("/config")
      .then((c) => setServerMode(c.mode))
      .catch(() => setServerMode("disconnected"));
    const authError = new URLSearchParams(location.search).get("auth_error");
    if (authError) {
      notify(authError);
      history.replaceState({}, "", location.pathname);
      open("login");
    }
    void api("/auth/me")
      .then(async (d) => {
        setAdmin(d.admin);
        await signedIn(d.user);
      })
      .catch(() => {
        if (new URLSearchParams(location.search).has("invite")) open("login");
      });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("nexora-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("nexora-language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(tm);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    const s = io(API || location.origin, { withCredentials: true });
    setSocket(s);
    s.on("connect", () => {
      if (roomRef.current) s.emit("room:join", { room_id: roomRef.current });
    });
    s.on("connect_error", () =>
      notify("Live connection interrupted. Reconnecting…"),
    );
    s.on("message", (m: Message) => {
      if (m.room_id === roomRef.current) {
        setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
        if (document.hasFocus())
          void post("/rooms/" + m.room_id + "/read").catch(() => {});
      } else if (user.status !== "dnd")
        notify("New message from " + m.profile.display_name);
    });
    s.on("message:update", (m: Message) =>
      setMessages((p) => p.map((x) => (x.id === m.id ? m : x))),
    );
    s.on("message:delete", ({ id }) =>
      setMessages((p) => p.filter((x) => x.id !== id)),
    );
    s.on("typing", (d: any) => {
      if (d.room_id === roomRef.current)
        setTyping((p) => ({
          ...p,
          [d.user_id]: { name: d.name, at: Date.now() },
        }));
    });
    s.on("presence", ({ user_id, status }) =>
      setMembers((p) =>
        p.map((m) =>
          m.user_id === user_id
            ? { ...m, profile: { ...m.profile, status } }
            : m,
        ),
      ),
    );
    s.on("profile", (p: Profile) => {
      setMembers((ms) =>
        ms.map((m) => (m.user_id === p.id ? { ...m, profile: p } : m)),
      );
      if (p.id === user.id) setUser(p);
    });
    s.on("notification", (n) => {
      setNotifications((p) => [n, ...p]);
      if (user.status !== "dnd") notify(n.text);
    });
    s.on("call:invite", (d) => setIncomingCall(d));
    s.on("refresh", () => void refresh().catch(() => {}));
    s.on("read", (d) => {
      if (d.room_id === roomRef.current && d.user_id !== user.id)
        setReadBy((p) => [...new Set([...p, d.user_id])]);
    });
    const timer = setInterval(
      () =>
        setTyping((p) =>
          Object.fromEntries(
            Object.entries(p).filter(([, v]) => Date.now() - v.at < 3500),
          ),
        ),
      1000,
    );
    return () => {
      s.disconnect();
      clearInterval(timer);
      setSocket(null);
    };
  }, [user?.id]);
  useEffect(() => {
    setReply(null);
    setEditing(null);
    setAttachment(null);
    setDraft("");
    setTyping({});
    setReadBy([]);
    if (preview) {
      setMessages(roomId === "hq-general" ? previewMessages : []);
      setMembers(
        previewPeople.map((p) => ({
          id: p.id,
          user_id: p.id,
          role_id: null,
          profile: p,
        })),
      );
      return;
    }
    if (!roomId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    let current = true;
    socket?.emit("room:join", { room_id: roomId });
    api<Message[]>("/rooms/" + roomId + "/messages")
      .then((d) => {
        if (current) setMessages(d);
      })
      .catch((e) => notify(e.message))
      .finally(() => {
        if (current) setLoadingMessages(false);
      });
    void post("/rooms/" + roomId + "/read").catch(() => {});
    return () => {
      current = false;
    };
  }, [roomId, user?.id, socket]);
  useEffect(() => {
    if (!user || !communityId) {
      if (user) setMembers([]);
      return;
    }
    void api<Member[]>("/communities/" + communityId + "/members")
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [communityId, user?.id, communities]);
  useEffect(() => {
    if (!search || preview || !roomId) return;
    let current = true;
    const timer = setTimeout(() => {
      api<Message[]>(
        "/rooms/" + roomId + "/messages?q=" + encodeURIComponent(search),
      )
        .then((d) => {
          if (current) setMessages(d);
        })
        .catch((e) => notify(e.message));
    }, 300);
    return () => {
      clearTimeout(timer);
      current = false;
    };
  }, [search]);
  useEffect(() => {
    if (!search && user) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    if (view === "discover")
      void api<Community[]>("/discover")
        .then(setDiscovery)
        .catch(() => {});
    if (view === "friends" && user)
      void api("/friends")
        .then(setFriendList)
        .catch((e) => notify(e.message));
  }, [view, user?.id]);
  useEffect(() => {
    if (modal === "manage" && communityId && user)
      void api("/communities/" + communityId + "/roles")
        .then(setRoles)
        .catch((e) => notify(e.message));
    if (modal === "settings" && user)
      void api("/blocks")
        .then(setBlockList)
        .catch(() => {});
    if (modal === "admin")
      void api("/admin")
        .then(setAdminData)
        .catch((e) => setError(e.message));
  }, [modal]);
  function chooseCommunity(c: Community) {
    setCommunityId(c.id);
    setRoomId(
      channels.find((ch) => ch.community_id === c.id && ch.kind === "text")
        ?.id || "",
    );
    setView("chat");
    setSearch("");
    setMobileNav(isMobile);
  }
  function chooseChannel(c: Channel) {
    if (c.kind === "voice") {
      if (requireAuth()) {
        setCall({ id: c.id, name: c.name });
        setMobileNav(false);
      }
      return;
    }
    setRoomId(c.id);
    setView("chat");
    setSearch("");
    setMobileNav(false);
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!requireAuth() || (!draft.trim() && !attachment)) return;
    await run(async () => {
      if (editing) {
        await patch("/messages/" + editing.id, { content: draft });
        setEditing(null);
      } else {
        const m = await post<Message>("/rooms/" + roomId + "/messages", {
          content: draft,
          reply_to: reply?.id || null,
          attachment_id: attachment?.id || null,
        });
        setMessages((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
      }
      setDraft("");
      setReply(null);
      setAttachment(null);
      setReadBy([]);
      textInput.current?.focus();
    });
  }
  async function react(m: Message, emoji: string) {
    if (!requireAuth()) return;
    await run(async () => {
      const updated = await post<Message>("/messages/" + m.id + "/reactions", {
        emoji,
      });
      setMessages((p) => p.map((x) => (x.id === m.id ? updated : x)));
    });
  }
  async function invite() {
    if (!requireAuth()) return;
    open("invite");
    await run(async () => {
      const d = await post("/communities/" + communityId + "/invites");
      setInviteUrl(d.url);
    });
  }
  async function dm(p: Profile) {
    if (!requireAuth()) return;
    await run(async () => {
      const c = await post<Conversation>("/conversations", {
        user_ids: [p.id],
        name: p.display_name,
      });
      await refresh();
      setCommunityId("");
      setRoomId(c.id);
      setView("chat");
      close();
    });
  }
  const visibleMessages = messages.filter(
    (m) => !search || m.content.toLowerCase().includes(search.toLowerCase()),
  );
  const communityChannels = channels.filter(
    (c) => c.community_id === communityId,
  );
  function formData(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  }
  const formError = error && (
    <div className="form-error" role="alert">
      {error}
    </div>
  );
  if (!user && !new URLSearchParams(location.search).has("preview"))
    return (
      <AuthPage
        mode={serverMode}
        onSignedIn={signedIn}
        initialError={
          new URLSearchParams(location.search).get("auth_error") || ""
        }
      />
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("chat");
          }}
        >
          <img src="/nexora.svg" alt="" />
          <span>NEXORA</span>
          <small>BETA</small>
        </a>
        <nav>
          <button
            className={view === "chat" ? "active" : ""}
            onClick={() => setView("chat")}
          >
            <MessageCircle size={17} />
            {t.home}
          </button>
          <button
            className={view === "discover" ? "active" : ""}
            onClick={() => setView("discover")}
          >
            <Compass size={17} />
            {t.discover}
          </button>
          <button
            className={view === "friends" ? "active" : ""}
            onClick={() => setView("friends")}
          >
            <Users size={17} />
            {t.friends}
          </button>
        </nav>
        <div className="top-actions">
          <span className="connection-label">
            <i className={user ? "live-dot" : "preview-dot"} />
            {user ? "Your space, connected" : "Explore the preview"}
          </span>
          <button
            className="icon-button notification-button"
            aria-label="Notifications"
            onClick={() => open("notifications")}
          >
            <Bell size={19} />
            {notifications.some((n) => !n.read) && <i />}
          </button>
          <span className="vertical-line" />
          <Avatar
            profile={me}
            size="small"
            onClick={() => open(user ? "settings" : "login")}
          />
        </div>
      </header>
      <div className="workspace">
        {mobileNav && <button className="mobile-nav-backdrop" aria-label="Close channels" onClick={() => setMobileNav(false)} />}
        <aside className="server-rail" inert={isMobile && !mobileNav}>
          <button
            className={
              "server-icon home-server " + (!communityId ? "selected" : "")
            }
            title="Direct messages"
            onClick={() => {
              setCommunityId("");
              setView("friends");
              setMobileNav(false);
            }}
          >
            <MessageCircle />
          </button>
          <div className="rail-divider" />
          {communities.map((c) => {
            const Icon = icons[c.icon] || Sparkles;
            return (
              <button
                key={c.id}
                title={c.name}
                className={
                  "server-icon " +
                  c.color +
                  " " +
                  (communityId === c.id ? "selected" : "")
                }
                onClick={() => chooseCommunity(c)}
              >
                <Icon />
              </button>
            );
          })}
          <button
            className="server-icon add-server"
            title="Create a community"
            onClick={() => requireAuth() && open("create")}
          >
            <Plus />
          </button>
          <button
            className={
              "server-icon discover-server " +
              (view === "discover" ? "selected" : "")
            }
            title="Discover communities"
            onClick={() => setView("discover")}
          >
            <Compass />
          </button>
          <div className="rail-bottom">
            <button
              className="server-icon"
              title="Help & information"
              onClick={() => open("help")}
            >
              <HelpCircle size={21} />
            </button>
          </div>
        </aside>
        <aside
          id="community-channels"
          inert={isMobile && !mobileNav}
          className={"channel-sidebar " + (mobileNav ? "mobile-open" : "")}
        >
          <div className="community-heading">
            <button className="mobile-drawer-close" aria-label="Close channel drawer" onClick={() => setMobileNav(false)}><X size={20}/></button>
            <div>
              <span className="overline">YOUR COMMUNITY</span>
              <button
                onClick={() =>
                  community ? open("manage") : setView("friends")
                }
              >
                {community?.name || "Your conversations"}
                <ChevronDown size={17} />
              </button>
            </div>
          </div>
          <div className="community-banner">
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <Sparkles size={23} />
            <strong>Better, together.</strong>
            <span>A place to just be you.</span>
          </div>
          <button
            className="invite-button"
            onClick={() => (community ? void invite() : open("friends"))}
          >
            <UserPlus size={16} />
            {t.invite}
            <Plus size={15} />
          </button>
          <div className="channel-scroll">
            {community ? (
              <>
                <div className="channel-category">
                  <ChevronDown size={12} /> START HERE
                </div>
                {communityChannels
                  .filter((c) => c.kind === "announcement")
                  .map((c) => (
                    <button
                      key={c.id}
                      className={
                        "channel " + (roomId === c.id ? "selected" : "")
                      }
                      onClick={() => chooseChannel(c)}
                    >
                      <Megaphone size={17} />
                      {c.name}
                      {c.name === "announcements" && (
                        <span className="channel-dot" />
                      )}
                    </button>
                  ))}
                <div className="channel-category">
                  <ChevronDown size={12} />
                  {t.text}
                  <button
                    aria-label="Create text channel"
                    onClick={() => requireAuth() && open("channel")}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {communityChannels
                  .filter((c) => c.kind === "text")
                  .map((c) => (
                    <button
                      key={c.id}
                      className={
                        "channel " + (roomId === c.id ? "selected" : "")
                      }
                      onClick={() => chooseChannel(c)}
                    >
                      <Hash size={18} />
                      {c.name}
                      {c.id === roomId && <span className="channel-current" />}
                    </button>
                  ))}
                <div className="channel-category">
                  <ChevronDown size={12} />
                  {t.voice}
                  <button
                    aria-label="Create voice channel"
                    onClick={() => requireAuth() && open("channel")}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {communityChannels
                  .filter((c) => c.kind === "voice")
                  .map((c) => (
                    <button
                      key={c.id}
                      className={
                        "channel " + (call?.id === c.id ? "voice-selected" : "")
                      }
                      onClick={() => chooseChannel(c)}
                    >
                      <Volume2 size={18} />
                      {c.name}
                      {call?.id === c.id && <span className="live-dot" />}
                    </button>
                  ))}
              </>
            ) : (
              <>
                <div className="channel-category">
                  {t.messages}
                  <button
                    aria-label="New group conversation"
                    onClick={() => requireAuth() && open("group")}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    className={"channel " + (roomId === c.id ? "selected" : "")}
                    onClick={() => {
                      setRoomId(c.id);
                      setView("chat");
                      setMobileNav(false);
                    }}
                  >
                    <MessageCircle size={18} />
                    {c.name}
                  </button>
                ))}
                {!conversations.length && (
                  <div className="sidebar-empty">
                    Good conversations start with a hello.
                    <button onClick={() => setView("friends")}>
                      Find a friend <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="free-note">
              <Zap size={15} />
              <span>Good company. Always free.</span>
            </div>
            <div className="user-panel">
              <Avatar
                profile={me}
                size="small"
                onClick={() => open(user ? "profile" : "login")}
              />
              <button
                className="user-name"
                onClick={() => open(user ? "profile" : "login")}
              >
                <strong>{me.display_name}</strong>
                <span>{user ? me.status : "Just looking around"}</span>
              </button>
              <button
                className="icon-button"
                title="Voice controls"
                onClick={() =>
                  call
                    ? notify(
                        "Your microphone controls are above the conversation.",
                      )
                    : notify("Join a voice channel to use your microphone.")
                }
              >
                <Mic size={16} />
              </button>
              <button
                className="icon-button"
                title="Settings"
                onClick={() => open("settings")}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </aside>
        <main className="main-panel">
          <div className="channel-header">
            <button
              className="icon-button mobile-menu"
              aria-label="Open channels"
              aria-expanded={mobileNav}
              aria-controls="community-channels"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu />
            </button>
            <div className="channel-title">
              {view === "discover" ? (
                <Compass />
              ) : view === "friends" ? (
                <Users />
              ) : (
                <Hash />
              )}
              <strong>
                {view === "chat"
                  ? roomName
                  : view === "discover"
                    ? t.discover
                    : t.friends}
              </strong>
            </div>
            <span className="header-description">
              {view === "chat"
                ? channel?.description || "Keep your favorite people close."
                : view === "discover"
                  ? "Find your corner of the internet."
                  : "Life’s better with your people."}
            </span>
            <div className="channel-tools">
              {view === "chat" && (
                <>
                  <button
                    className="icon-button"
                    title="Start a call"
                    onClick={() => {
                      if (requireAuth()) {
                        const r =
                          conversation ||
                          communityChannels.find((c) => c.kind === "voice");
                        if (r) setCall({ id: r.id, name: r.name });
                      }
                    }}
                  >
                    <Headphones size={19} />
                  </button>
                  <button
                    className={"icon-button " + (showMembers ? "on" : "")}
                    title="Toggle members"
                    onClick={() => setShowMembers(!showMembers)}
                  >
                    <Users size={19} />
                  </button>
                  <div className="search-box">
                    <input
                      aria-label="Search messages"
                      placeholder="Search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        if (!e.target.value && user && roomId)
                          void api<Message[]>(
                            "/rooms/" + roomId + "/messages",
                          ).then(setMessages);
                      }}
                    />
                    <Search size={14} />
                  </div>
                </>
              )}
              <button
                className="icon-button inbox"
                title="Notification inbox"
                onClick={() => open("notifications")}
              >
                <Inbox size={19} />
              </button>
            </div>
          </div>
          {view === "chat" ? (
            <div className="conversation-layout">
              <section className="chat-main">
                {call && socket && user && (
                  <Call
                    socket={socket}
                    room={call}
                    user={user}
                    onLeave={() => setCall(null)}
                    onError={notify}
                  />
                )}
                <div className="message-scroll">
                  {!search && (
                    <>
                      <div className="welcome-card">
                        <div className="welcome-glow" />
                        <div className="welcome-copy">
                          <span className="eyebrow">
                            <span /> YOUR PEOPLE. YOUR SPACE.
                          </span>
                          <h1>{t.welcome}</h1>
                          <p>{t.welcomeSub}</p>
                          <button
                            onClick={() =>
                              community ? void invite() : setView("discover")
                            }
                          >
                            Bring your people <ArrowRight size={15} />
                          </button>
                        </div>
                        <div className="cosmic-art" aria-hidden="true">
                          <div className="orbit orbit-a" />
                          <div className="orbit orbit-b" />
                          <div className="planet">
                            <img src="/nexora.svg" alt="" />
                          </div>
                          <i className="star star-a">✦</i>
                          <i className="star star-b">✦</i>
                          <i className="star star-c">✧</i>
                          <div className="little-planet" />
                        </div>
                      </div>
                      <div className="channel-intro">
                        <div className="intro-hash">
                          <Hash size={27} />
                        </div>
                        <div>
                          <h2>
                            {roomName === "general"
                              ? "Let’s start a conversation."
                              : "Welcome to " + roomName}
                          </h2>
                          <p>
                            {roomName === "general"
                              ? "Big ideas, random thoughts, or just a friendly hello. It all belongs here."
                              : channel?.description ||
                                "This is the beginning of your conversation."}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="date-divider">
                    <span />
                    {search
                      ? "Search results"
                      : new Date().toLocaleDateString(
                          lang === "ta" ? "ta-IN" : "en-US",
                          { month: "long", day: "numeric", year: "numeric" },
                        )}
                    <span />
                  </div>
                  {loadingMessages ? (
                    <div className="loading-row">
                      <span className="loader" />
                      Loading your conversation…
                    </div>
                  ) : (
                    <>
                      {user && messages.length >= 60 && !search && (
                        <button
                          className="load-older"
                          onClick={() =>
                            void run(async () => {
                              const older = await api<Message[]>(
                                "/rooms/" +
                                  roomId +
                                  "/messages?before=" +
                                  encodeURIComponent(messages[0].created_at),
                              );
                              setMessages((p) => [
                                ...older.filter(
                                  (m) => !p.some((x) => x.id === m.id),
                                ),
                                ...p,
                              ]);
                              if (!older.length)
                                notify("You’ve reached the beginning.");
                            })
                          }
                        >
                          Load earlier messages
                        </button>
                      )}
                      {visibleMessages.map((m, i) => {
                        const grouped =
                          i > 0 && visibleMessages[i - 1].user_id === m.user_id;
                        const parent = messages.find(
                          (x) => x.id === m.reply_to,
                        );
                        const counts = m.reactions.reduce(
                          (o, r) => ({
                            ...o,
                            [r.emoji]: (o[r.emoji] || 0) + 1,
                          }),
                          {} as Record<string, number>,
                        );
                        return (
                          <article
                            className={"message " + (grouped ? "grouped " : "") + (messageMenu === m.id ? "message-actions-open" : "")}
                            key={m.id}
                          >
                            {!grouped ? (
                              <Avatar
                                profile={m.profile}
                                onClick={() => {
                                  setSelectedUser(m.profile);
                                  open("user");
                                }}
                              />
                            ) : (
                              <span className="message-gutter" />
                            )}
                            <div className="message-content">
                              {!grouped && (
                                <div className="message-byline">
                                  <button
                                    className={m.profile.color}
                                    onClick={() => {
                                      setSelectedUser(m.profile);
                                      open("user");
                                    }}
                                  >
                                    {m.profile.display_name}
                                  </button>
                                  {m.profile.username === "alex" && (
                                    <span className="role-label">CREATOR</span>
                                  )}
                                  <time>
                                    {new Date(m.created_at).toLocaleTimeString(
                                      [],
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
                                  </time>
                                </div>
                              )}
                              {m.reply_to && (
                                <div className="reply-preview">
                                  <Reply size={12} />
                                  {parent
                                    ? parent.profile.display_name +
                                      ": " +
                                      parent.content.slice(0, 75)
                                    : "Reply to an earlier message"}
                                </div>
                              )}
                              {m.content === "[showcase]" ? (
                                <div className="project-card">
                                  <div className="project-grain" />
                                  <div className="project-top">
                                    <span>maya.design</span>
                                    <span>PORTFOLIO ’26 ↗</span>
                                  </div>
                                  <div className="project-ring" />
                                  <div className="project-wordmark">
                                    Ideas beyond
                                    <br />
                                    the ordinary<span>✦</span>
                                  </div>
                                  <div className="project-bottom">
                                    A little imagination. Infinite
                                    possibilities.
                                    <ArrowRight size={16} />
                                  </div>
                                </div>
                              ) : (
                                <p className="message-text">{m.content}</p>
                              )}
                              {m.attachment && (
                                <a
                                  className="attachment"
                                  href={
                                    API + "/api/attachments/" + m.attachment.id
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Paperclip size={18} />
                                  <span>
                                    {m.attachment.name}
                                    <small>
                                      {(m.attachment.size / 1024).toFixed(0)} KB
                                      · Download attachment
                                    </small>
                                  </span>
                                  <Download size={16} />
                                </a>
                              )}
                              {m.edited_at && (
                                <span className="edited">(edited)</span>
                              )}
                              {Object.keys(counts).length > 0 && (
                                <div className="reactions">
                                  {Object.entries(counts).map(
                                    ([emoji, count]) => (
                                      <button
                                        key={emoji}
                                        className={
                                          m.reactions.some(
                                            (r) =>
                                              r.emoji === emoji &&
                                              r.user_id === user?.id,
                                          )
                                            ? "mine"
                                            : ""
                                        }
                                        onClick={() => void react(m, emoji)}
                                      >
                                        {emoji}
                                        <span>{count}</span>
                                      </button>
                                    ),
                                  )}
                                  <button
                                    className="add-reaction"
                                    aria-label="Add heart reaction"
                                    onClick={() => void react(m, "💜")}
                                  >
                                    <Smile size={14} />
                                    <Plus size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <button className="message-more" aria-label={`Message actions for ${m.profile.display_name}`} aria-expanded={messageMenu === m.id} onClick={() => setMessageMenu(messageMenu === m.id ? null : m.id)}><MoreHorizontal size={20}/></button>
                            <div className="message-actions" onClick={() => setMessageMenu(null)}>
                              <button
                                title="React"
                                onClick={() => void react(m, "💜")}
                              >
                                <Smile size={15} />
                              </button>
                              <button
                                title="Reply"
                                onClick={() => {
                                  setReply(m);
                                  textInput.current?.focus();
                                }}
                              >
                                <Reply size={15} />
                              </button>
                              {m.user_id === user?.id && (
                                <button
                                  title="Edit message"
                                  onClick={() => {
                                    setEditing(m);
                                    setDraft(m.content);
                                    textInput.current?.focus();
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {(m.user_id === user?.id ||
                                community?.owner_id === user?.id) && (
                                <button
                                  title="Delete message"
                                  onClick={() =>
                                    void run(async () => {
                                      await remove("/messages/" + m.id);
                                      setMessages((p) =>
                                        p.filter((x) => x.id !== m.id),
                                      );
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              <button
                                title="Report message"
                                onClick={() => {
                                  if (requireAuth()) {
                                    setReportMessage(m);
                                    open("report");
                                  }
                                }}
                              >
                                <Flag size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {!visibleMessages.length && (
                        <div className="empty-chat">
                          <MessageCircle size={28} />
                          <h3>
                            {search
                              ? "No messages found"
                              : "The conversation starts with you."}
                          </h3>
                          <p>
                            {search
                              ? "Try a different word or phrase."
                              : "Drop a hello and make this space your own."}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <div ref={bottom} />
                </div>
                <div className="composer-area">
                  {preview && (
                    <div className="preview-notice">
                      <span>
                        <Sparkles size={13} /> Sample community ·{" "}
                        {serverMode === "disconnected"
                          ? "Backend not connected"
                          : "Join in and make it yours"}
                      </span>
                      <button onClick={() => open("register")}>
                        Create an account <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                  {(reply || editing || attachment) && (
                    <div className="compose-context">
                      <span>
                        {editing
                          ? "Editing your message"
                          : reply
                            ? "Replying to " + reply.profile.display_name
                            : attachment?.name}
                      </span>
                      <button
                        aria-label="Cancel message context"
                        onClick={() => {
                          setReply(null);
                          setEditing(null);
                          setAttachment(null);
                          setDraft("");
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <form className="composer" onSubmit={send}>
                    <input
                      ref={fileInput}
                      type="file"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f || !requireAuth()) return;
                        void run(async () => {
                          const data = new FormData();
                          data.append("file", f);
                          setAttachment(
                            await api("/rooms/" + roomId + "/upload", {
                              method: "POST",
                              body: data,
                            }),
                          );
                        });
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="attach-button"
                      title="Attach a file"
                      onClick={() =>
                        requireAuth() && fileInput.current?.click()
                      }
                    >
                      <Plus size={20} />
                    </button>
                    <textarea
                      ref={textInput}
                      rows={1}
                      maxLength={4000}
                      aria-label="Write a message"
                      placeholder={`${t.send} #${roomName}`}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (
                          user &&
                          socket &&
                          Date.now() - lastTyping.current > 2000
                        ) {
                          socket.emit("typing", { room_id: roomId });
                          lastTyping.current = Date.now();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(e);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      title="Emoji"
                      onClick={() => setEmojiPicker(!emojiPicker)}
                    >
                      <Smile size={21} />
                    </button>
                    <div className="composer-separator" />
                    <button
                      className="send-button"
                      type="submit"
                      aria-label="Send message"
                      disabled={busy}
                    >
                      <Send size={18} />
                    </button>
                    {emojiPicker && (
                      <div className="emoji-picker">
                        {[
                          "💜",
                          "🔥",
                          "👍",
                          "✨",
                          "😂",
                          "👀",
                          "👋",
                          "🎮",
                          "🚀",
                          "🎉",
                          "❤️",
                          "🙌",
                        ].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setDraft((d) => d + emoji);
                              setEmojiPicker(false);
                              textInput.current?.focus();
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </form>
                  <div className="composer-hint">
                    <span>
                      {Object.values(typing).length ? (
                        Object.values(typing)
                          .map((v) => v.name)
                          .join(", ") + " is typing…"
                      ) : readBy.length ? (
                        <>
                          <CheckCheck size={12} /> Seen by {readBy.length}
                        </>
                      ) : (
                        <>
                          <span className="tiny-spark">✦</span> A little
                          kindness goes a long way.
                        </>
                      )}
                    </span>
                    <span>
                      <kbd>Enter</kbd> to send{" "}
                      <span className="hint-dot">·</span>{" "}
                      <kbd>Shift + Enter</kbd> for a new line
                    </span>
                  </div>
                </div>
              </section>
              {showMembers && community && (
                <aside className="member-sidebar">
                  <div className="member-title">
                    {t.members}
                    <span>{members.length}</span>
                    <button
                      className="icon-button"
                      title="Invite members"
                      onClick={() => void invite()}
                    >
                      <UserPlus size={15} />
                    </button>
                  </div>
                  {["online", "offline"].map((group) => {
                    const ms = members.filter((m) =>
                      group === "offline"
                        ? m.profile.status === "offline"
                        : m.profile.status !== "offline",
                    );
                    return (
                      <div key={group} className="member-group">
                        <h3>
                          {group === "online" ? t.online : t.offline}{" "}
                          <span>— {ms.length}</span>
                        </h3>
                        {ms.map((m) => (
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setSelectedUser(m.profile);
                                open("user");
                              }
                            }}
                            key={m.id}
                            className={
                              "member-row " +
                              (group === "offline" ? "is-offline" : "")
                            }
                            onClick={() => {
                              setSelectedUser(m.profile);
                              open("user");
                            }}
                          >
                            <Avatar profile={m.profile} size="small" />
                            <span>
                              <strong>
                                {m.profile.display_name}
                                {m.user_id === community.owner_id && (
                                  <span className="owner-crown">♛</span>
                                )}
                              </strong>
                              <small>
                                {m.profile.activity ||
                                  m.profile.bio ||
                                  m.profile.status}
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="community-tip">
                    <div className="tip-icon">
                      <Heart size={18} />
                    </div>
                    <h3>
                      Small moments.
                      <br />
                      Real connections.
                    </h3>
                    <p>
                      Say hello to someone new.
                      <br />
                      You might find your people.
                    </p>
                    <button
                      onClick={() => {
                        setRoomId(
                          communityChannels.find(
                            (c) => c.name === "introductions",
                          )?.id || roomId,
                        );
                        setDraft("Hey everyone! 👋 ");
                        textInput.current?.focus();
                      }}
                    >
                      Introduce yourself <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="member-bottom">
                    <Shield size={13} /> A safe space to be yourself
                  </div>
                </aside>
              )}
            </div>
          ) : view === "discover" ? (
            <div className="discovery-page">
              <div className="discovery-hero">
                <span className="eyebrow">
                  <Compass size={15} /> DISCOVER YOUR NEXT CONNECTION
                </span>
                <h1>
                  There’s a place
                  <br />
                  for your kind of people<span>.</span>
                </h1>
                <p>
                  From the next big idea to your next gaming squad.
                  <br />
                  Find a community that feels like you.
                </p>
                <div className="discovery-orbit">
                  <Globe size={100} />
                  <Sparkles />
                </div>
              </div>
              <div className="discovery-toolbar">
                <div className="category-tabs">
                  {[
                    "All",
                    "Community",
                    "Gaming",
                    "Design",
                    "Technology",
                    "Music",
                  ].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() => requireAuth() && open("create")}
                >
                  <Plus size={16} />
                  Create community
                </button>
              </div>
              <h2>
                Find your space{" "}
                <span>
                  {
                    discovery.filter(
                      (c) => category === "All" || c.category === category,
                    ).length
                  }{" "}
                  communities
                </span>
              </h2>
              <div className="community-grid">
                {discovery
                  .filter((c) => category === "All" || c.category === category)
                  .map((c) => {
                    const Icon = icons[c.icon] || Sparkles;
                    return (
                      <div className="community-card" key={c.id}>
                        <div className={"card-art " + c.color}>
                          <div className="card-orbit" />
                          <Icon size={48} />
                          <span>{c.category}</span>
                        </div>
                        <div className="community-card-content">
                          <h3>
                            {c.name}
                            <Check size={16} />
                          </h3>
                          <p>{c.description}</p>
                          <div className="community-card-bottom">
                            <span>
                              <Users size={13} />
                              {c.member_count || 0} members
                            </span>
                            <button
                              onClick={() => {
                                if (!requireAuth()) return;
                                void run(async () => {
                                  await post("/communities/" + c.id + "/join");
                                  await refresh(c.id);
                                  setView("chat");
                                  notify("Welcome to " + c.name + "!");
                                });
                              }}
                            >
                              {communities.some((s) => s.id === c.id) && user
                                ? "Open"
                                : "Join community"}
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {!discovery.filter(
                (c) => category === "All" || c.category === category,
              ).length && (
                <div className="empty-chat">
                  <Sparkles />
                  <h3>Make the first move.</h3>
                  <p>Create the first community in this category.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="friends-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">BETTER TOGETHER</span>
                  <h1>Your people, a little closer.</h1>
                  <p>A hello can be the start of something great.</p>
                </div>
                <button
                  className="button"
                  onClick={() => requireAuth() && open("friends")}
                >
                  <UserPlus size={17} />
                  Add friend
                </button>
              </div>
              <div className="friends-tabs">
                <strong>All friends</strong>
                <span>
                  {friendList.filter((f) => f.status === "accepted").length}
                </span>
                <button onClick={() => requireAuth() && open("group")}>
                  <Plus size={15} />
                  New group
                </button>
              </div>
              {user && friendList.length ? (
                friendList.map((f) => (
                  <div className="friend-row" key={f.id}>
                    <Avatar profile={f.profile} />
                    <div>
                      <strong>{f.profile.display_name}</strong>
                      <p>
                        @{f.profile.username} ·{" "}
                        {f.status === "pending"
                          ? f.sender_id === user.id
                            ? "Request sent"
                            : "Wants to be your friend"
                          : f.profile.status}
                      </p>
                    </div>
                    {f.status === "accepted" ? (
                      <button
                        className="button secondary"
                        onClick={() => void dm(f.profile)}
                      >
                        <MessageCircle size={16} />
                        Message
                      </button>
                    ) : (
                      f.receiver_id === user.id && (
                        <button
                          className="button"
                          onClick={() =>
                            void run(async () => {
                              await patch("/friends/" + f.id, {});
                              setFriendList(await api("/friends"));
                            })
                          }
                        >
                          Accept
                        </button>
                      )
                    )}
                    <button
                      className="icon-button"
                      title="Remove friend or decline request"
                      onClick={() =>
                        void run(async () => {
                          await remove("/friends/" + f.id);
                          setFriendList(await api("/friends"));
                        })
                      }
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="friends-empty">
                  <div className="empty-people">
                    <div className="avatar pink">M</div>
                    <div className="avatar violet">N</div>
                    <div className="avatar blue">A</div>
                  </div>
                  <h2>Good company is just a hello away.</h2>
                  <p>
                    Add a friend by username, or discover a community
                    <br />
                    and meet people who share your interests.
                  </p>
                  <button
                    className="button"
                    onClick={() => setView("discover")}
                  >
                    Explore communities <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {incomingCall && user && (
        <div className="incoming-call">
          <div className="incoming-icon">
            <Video size={23} />
          </div>
          <div>
            <strong>{incomingCall.caller} started a group call</strong>
            <p>{incomingCall.room.name}</p>
          </div>
          <button
            className="button"
            onClick={() => {
              setRoomId(incomingCall.room.id);
              setCommunityId("");
              setView("chat");
              setCall(incomingCall.room);
              setIncomingCall(null);
            }}
          >
            Join call
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss call"
            onClick={() => setIncomingCall(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {(modal === "login" || modal === "register") && (
        <Modal
          title={modal === "login" ? "Welcome back." : "Find your people."}
          subtitle={
            modal === "login"
              ? "Your corner of the internet missed you."
              : "Your next great conversation starts here."
          }
          close={close}
        >
          <div className="auth-brand">
            <img src="/nexora.svg" alt="NEXORA" />
          </div>
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                const d = await post("/auth/" + modal, data);
                if (modal === "register") {
                  notify(
                    d.confirmation
                      ? "Check your email to confirm your account, then sign in."
                      : "Account created. Log in to continue.",
                  );
                  setModal("login");
                  return;
                }
                await signedIn(d.user);
                notify("Welcome to NEXORA. Make yourself at home!");
              });
            }}
          >
            {modal === "register" && (
              <label>
                Username
                <input
                  name="username"
                  placeholder="your_unique_name"
                  pattern="[a-z0-9_]{3,24}"
                  minLength={3}
                  maxLength={24}
                  required
                />
                <small>3–24 lowercase letters, numbers, or underscores</small>
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                placeholder={
                  modal === "register"
                    ? "At least 10 characters"
                    : "Your password"
                }
                minLength={modal === "register" ? 10 : 1}
                maxLength={128}
                autoComplete={
                  modal === "register" ? "new-password" : "current-password"
                }
                required
              />
            </label>
            {formError}
            <button className="button full" disabled={busy}>
              {busy
                ? "One moment…"
                : modal === "login"
                  ? "Let’s go"
                  : "Create your account"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="or-divider">
            <span />
            or
            <span />
          </div>
          <button
            className="google-button"
            onClick={() =>
              serverMode === "supabase"
                ? location.assign(API + "/api/auth/google")
                : setError(
                    "Google sign-in needs Supabase and a Google OAuth provider. See the included setup guide.",
                  )
            }
          >
            <span>G</span>Continue with Google
          </button>
          <p className="auth-switch">
            {modal === "login"
              ? "New around here?"
              : "Already found your space?"}{" "}
            <button
              onClick={() => open(modal === "login" ? "register" : "login")}
            >
              {modal === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          {serverMode !== "supabase" && (
            <p className="form-note">
              {serverMode === "local"
                ? "Local development · accounts are stored on this computer."
                : "This preview needs the included backend before accounts can be created."}
            </p>
          )}
        </Modal>
      )}
      {modal === "create" && (
        <Modal
          title="A space of your own."
          subtitle="Private by default. Invite your squad and make it yours."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                const c = await post<Community>("/communities", {
                  ...data,
                  is_public: data.is_public === "on",
                });
                await refresh(c.id);
                setView("chat");
                close();
                notify("Your community is ready.");
              });
            }}
          >
            <label>
              Community name
              <input
                name="name"
                placeholder="The next great hangout"
                minLength={2}
                maxLength={48}
                required
              />
            </label>
            <label>
              About your community
              <textarea
                name="description"
                placeholder="What brings your people together?"
                maxLength={180}
              />
            </label>
            <label>
              Category
              <select name="category">
                {["Community", "Gaming", "Design", "Technology", "Music"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
            <label className="check-label">
              <input type="checkbox" name="is_public" />
              Show in community discovery
            </label>
            {formError}
            <button className="button full" disabled={busy}>
              Create community <Sparkles size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "channel" && (
        <Modal
          title="Make room for more."
          subtitle="A new channel, a new conversation."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                const c = await post<Channel>(
                  "/communities/" + communityId + "/channels",
                  data,
                );
                await refresh();
                if (c.kind !== "voice") setRoomId(c.id);
                close();
              });
            }}
          >
            <label>
              Channel name
              <input
                name="name"
                placeholder="your-new-channel"
                maxLength={40}
                required
              />
            </label>
            <label>
              Type
              <select name="kind">
                <option value="text">Text channel</option>
                <option value="voice">Voice channel</option>
                <option value="announcement">Announcement channel</option>
              </select>
            </label>
            <label>
              Description
              <input
                name="description"
                placeholder="What’s this space for?"
                maxLength={150}
              />
            </label>
            {formError}
            <button className="button" disabled={busy}>
              Create channel
            </button>
          </form>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal
          title="Good things are better shared."
          subtitle={
            "Invite your people to " +
            community?.name +
            ". This link expires in 7 days."
          }
          close={close}
        >
          <div className="invite-illustration">
            <UserPlus size={45} />
            <Sparkles size={24} />
          </div>
          <div className="copy-link">
            <input
              aria-label="Invite link"
              value={inviteUrl || "Creating your invite…"}
              readOnly
            />
            <button
              className="button"
              disabled={!inviteUrl}
              onClick={() =>
                void navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => notify("Invite link copied!"))
                  .catch(() => notify("Select and copy the link above."))
              }
            >
              <Copy size={16} />
              Copy
            </button>
          </div>
          {formError}
        </Modal>
      )}
      {modal === "profile" && (
        <Modal
          title="A little more you."
          subtitle="Let your personality do the talking."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                setUser(await patch("/profile", data));
                close();
                notify("Looking good. Profile updated.");
              });
            }}
          >
            <div className="profile-preview">
              <Avatar profile={me} size="large" />
              <div>
                <strong>{me.display_name}</strong>
                <span>@{me.username}</span>
              </div>
            </div>
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={me.display_name}
                maxLength={40}
                required
              />
            </label>
            <label>
              Bio
              <textarea name="bio" defaultValue={me.bio} maxLength={200} />
            </label>
            <label>
              Profile picture URL
              <input
                type="url"
                name="avatar_url"
                defaultValue={me.avatar_url}
                placeholder="https://…"
              />
            </label>
            <div className="form-columns">
              <label>
                Status
                <select name="status" defaultValue={me.status}>
                  <option value="online">Online</option>
                  <option value="idle">Idle</option>
                  <option value="dnd">Do Not Disturb</option>
                  <option value="offline">Invisible</option>
                </select>
              </label>
              <label>
                Avatar color
                <select name="color" defaultValue={me.color}>
                  {["violet", "blue", "pink", "green", "orange", "teal"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label>
              Gaming / activity status
              <input
                name="activity"
                defaultValue={me.activity}
                placeholder="Playing your next favorite game"
                maxLength={60}
              />
            </label>
            {formError}
            <button className="button full" disabled={busy}>
              Save profile <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title={t.settings}
          subtitle="Make this space feel like you."
          close={close}
        >
          <div className="settings-section">
            <h3>Appearance</h3>
            <div className="theme-options">
              {["midnight", "amethyst", "ocean"].map((c) => (
                <button
                  key={c}
                  className={
                    "theme-choice " + c + " " + (theme === c ? "selected" : "")
                  }
                  onClick={() => setTheme(c)}
                >
                  <span />
                  {c}
                  {theme === c && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>Language / மொழி</strong>
              <p>Navigation and interface language</p>
            </div>
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => setLang(e.target.value as "en" | "ta")}
            >
              <option value="en">English</option>
              <option value="ta">தமிழ்</option>
            </select>
          </div>
          {user ? (
            <>
              <div className="setting-row">
                <div>
                  <strong>Allow direct messages</strong>
                  <p>Let other members start a conversation</p>
                </div>
                <input
                  aria-label="Allow direct messages"
                  className="toggle"
                  type="checkbox"
                  checked={user.allow_dms}
                  onChange={(e) =>
                    void run(async () =>
                      setUser(
                        await patch("/profile", {
                          allow_dms: e.target.checked,
                        }),
                      ),
                    )
                  }
                />
              </div>
              <button className="settings-link" onClick={() => open("profile")}>
                <Pencil size={17} />
                {t.edit}
                <ChevronRight size={16} />
              </button>
              {blockList.length > 0 && (
                <div className="settings-section">
                  <h3>Blocked people</h3>
                  {blockList.map((b) => (
                    <div className="setting-row" key={b.id}>
                      <span>{b.profile?.display_name}</span>
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(async () => {
                            await remove("/blocks/" + b.target_id);
                            setBlockList(await api("/blocks"));
                          })
                        }
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {admin && (
                <button className="settings-link" onClick={() => open("admin")}>
                  <Shield size={17} />
                  Admin dashboard
                  <ChevronRight size={16} />
                </button>
              )}
              <button
                className="settings-link danger-text"
                onClick={() =>
                  void run(async () => {
                    await post("/auth/logout");
                    setUser(null);
                    setCommunities(previewCommunities);
                    setChannels(previewChannels);
                    setCommunityId("hq");
                    setRoomId("hq-general");
                    setMessages(previewMessages);
                    setNotifications([]);
                    setConversations([]);
                    setCall(null);
                    setAdmin(false);
                    close();
                  })
                }
              >
                <LogOut size={17} />
                Sign out
              </button>
            </>
          ) : (
            <button className="button full" onClick={() => open("register")}>
              Create your account <ArrowRight size={16} />
            </button>
          )}
          {formError}
          <div className="settings-version">
            <img src="/nexora.svg" alt="" />
            NEXORA · A little closer, together.<span>v1.0</span>
          </div>
        </Modal>
      )}
      {modal === "user" && selectedUser && (
        <Modal
          title={selectedUser.display_name}
          subtitle={"@" + selectedUser.username}
          close={close}
        >
          <div className={"user-profile-banner " + selectedUser.color}>
            <Avatar profile={selectedUser} size="large" />
          </div>
          <div className="profile-bio">
            <span className="eyebrow">ABOUT ME</span>
            <p>{selectedUser.bio || "Still writing their story."}</p>
            {selectedUser.activity && (
              <p>
                <Gamepad2 size={15} />
                {selectedUser.activity}
              </p>
            )}
            <small>
              <i className={"status inline " + selectedUser.status} />
              {selectedUser.status}
            </small>
          </div>
          {selectedUser.id !== user?.id ? (
            <>
              <button
                className="button full"
                onClick={() => void dm(selectedUser)}
              >
                <MessageCircle size={17} />
                Say hello
              </button>
              <div className="profile-actions">
                <button
                  onClick={() => {
                    if (requireAuth())
                      void run(async () => {
                        await post("/friends", {
                          username: selectedUser.username,
                        });
                        notify("Friend request sent.");
                      });
                  }}
                >
                  <UserPlus size={15} />
                  Add friend
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    if (requireAuth())
                      void run(async () => {
                        await post("/blocks/" + selectedUser.id);
                        setMessages((p) =>
                          p.filter((m) => m.user_id !== selectedUser.id),
                        );
                        close();
                        notify("User blocked.");
                      });
                  }}
                >
                  <Shield size={15} />
                  Block
                </button>
              </div>
            </>
          ) : (
            <button className="button full" onClick={() => open("profile")}>
              Edit profile
            </button>
          )}
          {formError}
        </Modal>
      )}
      {modal === "friends" && (
        <Modal
          title="Start with a hello."
          subtitle="Add a friend using their unique NEXORA username."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                await post("/friends", data);
                close();
                notify("Friend request sent!");
                setFriendList(await api("/friends"));
              });
            }}
          >
            <label>
              Username
              <input
                name="username"
                placeholder="your_friend"
                minLength={3}
                maxLength={24}
                required
              />
            </label>
            {formError}
            <button className="button full" disabled={busy}>
              Send friend request <UserPlus size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "group" && (
        <Modal
          title="Bring the group together."
          subtitle="Start a private conversation with up to 8 friends."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const c = await post<Conversation>("/conversations", {
                  name: f.get("name"),
                  user_ids: f.getAll("members"),
                });
                await refresh();
                setCommunityId("");
                setRoomId(c.id);
                setView("chat");
                close();
              });
            }}
          >
            <label>
              Group name
              <input
                name="name"
                placeholder="The inner circle"
                required
                maxLength={40}
              />
            </label>
            {friendList
              .filter((f) => f.status === "accepted")
              .map((f) => (
                <label className="check-label" key={f.id}>
                  <input type="checkbox" name="members" value={f.profile.id} />
                  {f.profile.display_name}
                </label>
              ))}
            {!friendList.some((f) => f.status === "accepted") && (
              <p className="form-note">
                Add and accept a friend first. Your friends will appear here.
              </p>
            )}
            {formError}
            <button className="button" disabled={busy}>
              Create group
            </button>
          </form>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal
          title="Your little updates."
          subtitle="All the things worth catching up on."
          close={close}
        >
          {notifications.length ? (
            <>
              <button
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    await patch("/notifications/read", {});
                    setNotifications((p) =>
                      p.map((n) => ({ ...n, read: true })),
                    );
                  })
                }
              >
                Mark all as read
              </button>
              {notifications.map((n) => (
                <div
                  className={"notification-item " + (n.read ? "read" : "")}
                  key={n.id}
                >
                  <Bell size={18} />
                  <div>
                    <p>{n.text}</p>
                    <small>{new Date(n.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-chat">
              <Inbox size={36} />
              <h3>All caught up.</h3>
              <p>New friend requests and updates will appear here.</p>
            </div>
          )}
          {formError}
        </Modal>
      )}
      {modal === "report" && reportMessage && (
        <Modal
          title="Help keep this space safe."
          subtitle="Reports go to the platform’s moderation team."
          close={close}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              const data = formData(e);
              void run(async () => {
                await post("/reports", {
                  ...data,
                  message_id: reportMessage.id,
                });
                close();
                notify(
                  "Report received. Thank you for looking out for the community.",
                );
              });
            }}
          >
            <label>
              What happened?
              <textarea
                name="reason"
                minLength={5}
                maxLength={500}
                placeholder="Tell us why you’re reporting this message."
                required
              />
            </label>
            {formError}
            <button className="button" disabled={busy}>
              Submit report
            </button>
          </form>
        </Modal>
      )}
      {modal === "manage" && (
        <Modal
          title={community?.name || "Community settings"}
          subtitle="A great community starts with a little care."
          close={close}
          wide
        >
          {preview ? (
            <div className="empty-chat">
              <Shield size={32} />
              <h3>Your community, your rules.</h3>
              <p>
                Create an account to build communities, set roles, and manage
                members.
              </p>
              <button className="button" onClick={() => open("register")}>
                Get started
              </button>
            </div>
          ) : (
            <>
              <div className="manage-actions">
                <button
                  className="button secondary"
                  onClick={() => open("channel")}
                >
                  <Plus size={16} />
                  Create channel
                </button>
                <button
                  className="button secondary"
                  onClick={() => void invite()}
                >
                  <UserPlus size={16} />
                  Invite members
                </button>
              </div>
              <h3 className="section-title">Roles & permissions</h3>
              {roles.map((r) => (
                <div className="role-item" key={r.id}>
                  <Shield size={15} />
                  <strong>{r.name}</strong>
                  <span>
                    {r.permissions.join(", ").replaceAll("_", " ") ||
                      "Member access"}
                  </span>
                </div>
              ))}
              {community?.owner_id === user?.id && (
                <form
                  className="form-stack role-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const target = e.currentTarget;
                    void run(async () => {
                      await post("/communities/" + communityId + "/roles", {
                        name: f.get("name"),
                        permissions: f.getAll("permissions"),
                      });
                      setRoles(
                        await api("/communities/" + communityId + "/roles"),
                      );
                      target.reset();
                      notify("Role created.");
                    });
                  }}
                >
                  <label>
                    New role
                    <input
                      name="name"
                      maxLength={24}
                      placeholder="e.g. Moderator"
                      required
                    />
                  </label>
                  <div className="permission-options">
                    {[
                      ["manage_channels", "Manage channels"],
                      ["moderate_messages", "Moderate messages"],
                      ["manage_members", "Manage members"],
                    ].map(([value, label]) => (
                      <label className="check-label" key={value}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={value}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <button className="button secondary" disabled={busy}>
                    Create role
                  </button>
                </form>
              )}
              <h3 className="section-title">Community members</h3>
              <div className="manage-member-list">
                {members.map((m) => (
                  <div className="manage-member" key={m.id}>
                    <Avatar profile={m.profile} size="small" />
                    <span>{m.profile.display_name}</span>
                    {m.user_id === community?.owner_id ? (
                      <small>Owner</small>
                    ) : (
                      <>
                        <select
                          aria-label={"Role for " + m.profile.display_name}
                          value={m.role_id || ""}
                          disabled={community?.owner_id !== user?.id}
                          onChange={(e) =>
                            void run(async () => {
                              await patch(
                                "/communities/" +
                                  communityId +
                                  "/members/" +
                                  m.user_id,
                                { role_id: e.target.value || null },
                              );
                              setMembers(
                                await api(
                                  "/communities/" + communityId + "/members",
                                ),
                              );
                            })
                          }
                        >
                          <option value="">Member</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="text-button danger-text"
                          onClick={() =>
                            void run(async () => {
                              await remove(
                                "/communities/" +
                                  communityId +
                                  "/members/" +
                                  m.user_id +
                                  "?ban=true",
                              );
                              setMembers(
                                await api(
                                  "/communities/" + communityId + "/members",
                                ),
                              );
                              notify("Member banned from this community.");
                            })
                          }
                        >
                          Ban
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {formError}
        </Modal>
      )}
      {modal === "admin" && (
        <Modal
          title="Keep NEXORA a good place."
          subtitle="Platform administration"
          close={close}
          wide
        >
          {adminData && (
            <>
              <div className="admin-stats">
                {["users", "communities", "messages"].map((k) => (
                  <div key={k}>
                    <strong>{adminData[k]}</strong>
                    <span>{k}</span>
                  </div>
                ))}
              </div>
              <h3 className="section-title">Reports</h3>
              {adminData.reports.map((r: any) => (
                <div className="report-item" key={r.id}>
                  <p>{r.reason}</p>
                  <small>Message: {r.message_id}</small>
                  <p className="reported-message">
                    {r.message?.deleted
                      ? "Message removed"
                      : r.message?.content}
                  </p>
                  {!r.message?.deleted && (
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        void run(async () => {
                          await remove("/admin/messages/" + r.message_id);
                          setAdminData(await api("/admin"));
                        })
                      }
                    >
                      Remove reported message
                    </button>
                  )}
                  <button
                    className="button secondary"
                    disabled={r.status === "resolved"}
                    onClick={() =>
                      void run(async () => {
                        await patch("/admin/reports/" + r.id, {});
                        setAdminData(await api("/admin"));
                      })
                    }
                  >
                    {r.status === "resolved" ? "Resolved" : "Mark resolved"}
                  </button>
                </div>
              ))}
              {!adminData.reports.length && <p>No reports. All clear.</p>}
            </>
          )}
          {formError}
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Welcome to your next space."
          subtitle="NEXORA brings your people a little closer."
          close={close}
        >
          <div className="help-list">
            <div>
              <MessageCircle />
              <span>
                <strong>Make conversation</strong>
                <p>
                  Join a community, pick a text channel, and say hello. Hover
                  over messages to reply or react.
                </p>
              </span>
            </div>
            <div>
              <Headphones />
              <span>
                <strong>Hang out, face to face</strong>
                <p>
                  Join a voice channel, turn on your camera, or share your
                  screen. Calls support up to six people.
                </p>
              </span>
            </div>
            <div>
              <Lock />
              <span>
                <strong>Your space is yours</strong>
                <p>
                  Control direct messages, block people, and report messages
                  from your profile and message menus.
                </p>
              </span>
            </div>
          </div>
          <p className="form-note">
            {preview
              ? "You’re exploring a sample community. Sign in to use live messaging and calls."
              : "Connected to " + serverMode + " storage."}{" "}
            NEXORA has no subscription or paywall. Hosting and network usage
            depend on your provider’s limits.
          </p>
          <button
            className="button full"
            onClick={() => {
              close();
              setView("discover");
            }}
          >
            Find your community <Compass size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}
