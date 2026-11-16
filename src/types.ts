export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  color: string;
  status: string;
  avatar_url: string;
  activity: string;
  allow_dms: boolean;
};
export type Community = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  owner_id: string;
  is_public: boolean;
  member_count?: number;
};
export type Channel = {
  id: string;
  community_id: string;
  name: string;
  kind: "text" | "voice" | "announcement";
  description: string;
};
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
};
export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at?: string;
  reply_to?: string;
  profile: Profile;
  reactions: { id: string; user_id: string; emoji: string }[];
  attachment?: Attachment;
};
export type Member = {
  id: string;
  user_id: string;
  role_id: string | null;
  profile: Profile;
};
export type Conversation = { id: string; name: string };
export type Notification = {
  id: string;
  text: string;
  read: boolean;
  created_at: string;
};
