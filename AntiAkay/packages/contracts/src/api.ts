export interface Cursor {
  created_at: string;
  id: string;
}

export interface MessageWire {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  status: "active" | "deleted";
  version: number;
  created_at: string;
  edited_at: string | null;
  client_nonce: string;
}

export interface CreateMessageCommand {
  name: "MESSAGE_CREATE";
  channel_id: string;
  client_nonce: string;
  content: string;
  reply_to_id?: string;
}

export interface UpdateMessageCommand {
  name: "MESSAGE_UPDATE";
  message_id: string;
  content: string;
  expected_version: number;
}

export interface DeleteMessageCommand {
  name: "MESSAGE_DELETE";
  message_id: string;
}

export interface TypingCommand {
  name: "TYPING_START";
  channel_id: string;
}

export type GatewayCommand = CreateMessageCommand | UpdateMessageCommand | DeleteMessageCommand | TypingCommand;

export interface Page<T> {
  items: T[];
  next_cursor: Cursor | null;
}

export interface ApiError {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "VALIDATION_ERROR";
  message: string;
  retry_after_ms?: number;
  request_id: string;
}
