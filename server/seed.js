import { randomUUID } from "node:crypto";
export async function seed(db) {
  if ((await db.list("communities")).length) return;
  const now = new Date().toISOString();
  const people = [
    ["Nova", "nova", "Building little things for the internet.", "violet"],
    ["Alex Chen", "alex", "Designing a better tomorrow.", "blue"],
    ["Maya Patel", "maya", "Pixels, playlists & late night ideas.", "pink"],
    ["Jordan Lee", "jordan", "Probably playing something.", "green"],
    ["Sam Rivera", "sam", "Code. Coffee. Repeat.", "orange"],
    ["Kai Morgan", "kai", "Here for the good conversations.", "teal"],
  ];
  const ids = [];
  for (const [display_name, username, bio, color] of people) {
    const id = randomUUID();
    ids.push(id);
    await db.insert("profiles", {
      id,
      display_name,
      username,
      bio,
      color,
      status: "offline",
      avatar_url: "",
      activity: "",
      allow_dms: true,
      created_at: now,
    });
  }
  const communities = [
    [
      "Nexora HQ",
      "The official home for curious minds, creators, and good conversations.",
      "sparkles",
      "violet",
      "Community",
    ],
    [
      "Pixel Playground",
      "A little corner of the internet for design, art, and everything creative.",
      "palette",
      "pink",
      "Design",
    ],
    [
      "After Hours",
      "Find your squad. Queue up. Make some memories.",
      "gamepad",
      "green",
      "Gaming",
    ],
    [
      "Build Together",
      "Ship your next big idea with people who get it.",
      "code",
      "blue",
      "Technology",
    ],
  ];
  for (let i = 0; i < communities.length; i++) {
    const [name, description, icon, color, category] = communities[i];
    const id = randomUUID();
    await db.insert("communities", {
      id,
      name,
      description,
      icon,
      color,
      category,
      owner_id: ids[0],
      is_public: true,
      created_at: now,
    });
    for (const uid of ids)
      await db.insert("members", {
        id: randomUUID(),
        community_id: id,
        user_id: uid,
        role_id: null,
        joined_at: now,
      });
    const channelIds = [];
    for (const [name, kind, description] of [
      ["welcome", "announcement", "A fresh start. A shared space."],
      ["announcements", "announcement", "The latest from the NEXORA team."],
      ["general", "text", "A little bit of everything. Make yourself at home."],
      ["introductions", "text", "New here? Say hello to your people."],
      ["off-topic", "text", "Let the conversation wander."],
      ["share-your-work", "text", "Made something? We want to see it."],
      ["The Lounge", "voice", "Good company, great conversations."],
      ["Gaming Room", "voice", "Your next adventure starts here."],
      ["Focus Room", "voice", "A quiet place to get things done."],
    ]) {
      const cid = randomUUID();
      channelIds.push(cid);
      await db.insert("channels", {
        id: cid,
        community_id: id,
        name,
        kind,
        description,
        created_at: now,
      });
    }
    if (i === 0) {
      const samples = [
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
      ];
      for (let j = 0; j < samples.length; j++) {
        await db.insert("messages", {
          id: randomUUID(),
          room_id: channelIds[2],
          user_id: ids[samples[j][0]],
          content: samples[j][1],
          reply_to: null,
          attachment_id: null,
          created_at: new Date(
            Date.now() - (samples.length - j) * 180000,
          ).toISOString(),
          edited_at: null,
          deleted: false,
        });
      }
    }
  }
}
