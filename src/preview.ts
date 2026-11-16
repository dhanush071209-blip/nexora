import type { Profile, Community, Channel, Message } from "./types";
export const previewPeople: Profile[] = [
  ["nova", "Nova", "violet", "Dreaming up what’s next."],
  ["alex", "Alex Chen", "blue", "Designing a better tomorrow."],
  ["maya", "Maya Patel", "pink", "Pixels, playlists & late night ideas."],
  ["jordan", "Jordan Lee", "green", "Probably playing something."],
  ["sam", "Sam Rivera", "orange", "Code. Coffee. Repeat."],
  ["kai", "Kai Morgan", "teal", "Here for the good conversations."],
].map(([id, display_name, color, bio], i) => ({
  id,
  username: id,
  display_name,
  color,
  bio,
  status: i === 4 ? "idle" : i === 5 ? "offline" : "online",
  avatar_url: "",
  activity: i === 3 ? "Playing Valorant" : "",
  allow_dms: true,
}));
export const previewCommunities: Community[] = [
  [
    "hq",
    "Nexora HQ",
    "The home for curious minds, creators, and good conversations.",
    "sparkles",
    "violet",
    "Community",
  ],
  [
    "pixel",
    "Pixel Playground",
    "A space to create, get inspired, and share what you love.",
    "palette",
    "pink",
    "Design",
  ],
  [
    "gaming",
    "After Hours",
    "Find your squad. Queue up. Make some memories.",
    "gamepad",
    "green",
    "Gaming",
  ],
  [
    "code",
    "Build Together",
    "Turn your late-night ideas into your next big thing.",
    "code",
    "blue",
    "Technology",
  ],
].map(([id, name, description, icon, color, category]) => ({
  id,
  name,
  description,
  icon,
  color,
  category,
  owner_id: "nova",
  is_public: true,
  member_count: 6,
}));
export const previewChannels: Channel[] = previewCommunities.flatMap((c) =>
  [
    ["welcome", "announcement", "Your next chapter starts here."],
    ["announcements", "announcement", "The latest from the NEXORA team."],
    ["general", "text", "A little bit of everything. Make yourself at home."],
    ["introductions", "text", "New here? Say hello to your people."],
    ["off-topic", "text", "Let the conversation wander."],
    ["share-your-work", "text", "Made something? We want to see it."],
    ["The Lounge", "voice", "Good company, great conversations."],
    ["Gaming Room", "voice", "Find your squad."],
    ["Focus Room", "voice", "A quiet place to get things done."],
  ].map(([name, kind, description]) => ({
    id: c.id + "-" + name,
    community_id: c.id,
    name,
    kind: kind as Channel["kind"],
    description,
  })),
);
export const previewMessages: Message[] = [
  [
    1,
    "Hey everyone! Welcome to our little corner of the internet. 👋\nWhat’s everyone working on today?",
  ],
  [
    2,
    "Finally finished the visual direction for my new portfolio! Going for a dreamy, cosmic vibe. ✨",
  ],
  [2, "[showcase]"],
  [3, "Okay this is so clean. The colors are incredible 🔥"],
  [4, "Right? That purple gradient is everything."],
  [
    5,
    "Love seeing everyone’s projects here. This community already feels like home 💜",
  ],
].map(([person, content], i) => ({
  id: "preview-" + i,
  room_id: "hq-general",
  user_id: previewPeople[Number(person)].id,
  content: String(content),
  created_at: new Date(Date.now() - (6 - i) * 180000).toISOString(),
  profile: previewPeople[Number(person)],
  reactions:
    i === 2
      ? [
          { id: "r1", user_id: "alex", emoji: "🔥" },
          { id: "r2", user_id: "jordan", emoji: "💜" },
          { id: "r3", user_id: "sam", emoji: "💜" },
        ]
      : [],
}));
