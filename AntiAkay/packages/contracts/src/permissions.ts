export type PermissionValue = bigint;

/** 64-bit permission ABI. Never JSON.stringify bigint directly: use toWire(). */
export const Permission = {
  READ_MESSAGES: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  MANAGE_MESSAGES: 1n << 2n,
  EMBED_LINKS: 1n << 3n,
  ATTACH_FILES: 1n << 4n,
  ADD_REACTIONS: 1n << 5n,
  VIEW_CHANNEL: 1n << 6n,
  CONNECT: 1n << 7n,
  SPEAK: 1n << 8n,
  STREAM: 1n << 9n,
  MUTE_MEMBERS: 1n << 10n,
  DEAFEN_MEMBERS: 1n << 11n,
  MOVE_MEMBERS: 1n << 12n,
  MANAGE_CHANNELS: 1n << 13n,
  MANAGE_GUILD: 1n << 14n,
  MANAGE_ROLES: 1n << 15n,
  KICK_MEMBERS: 1n << 16n,
  BAN_MEMBERS: 1n << 17n,
  ADMINISTRATOR: 1n << 60n
} as const satisfies Record<string, bigint>;

export const ALL_PERMISSIONS = Object.values(Permission).reduce((mask, bit) => mask | bit, 0n);

export interface RoleForPermission {
  id: string;
  position: number;
  permissions: PermissionValue;
}

export interface PermissionOverwrite {
  roleId?: string;
  userId?: string;
  allow: PermissionValue;
  deny: PermissionValue;
}

export interface PermissionContext {
  userId: string;
  guildOwnerId: string;
  everyoneRoleId: string;
  roles: RoleForPermission[];
  memberRoleIds: string[];
  overwrites: PermissionOverwrite[];
}

export function fromWire(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error("Invalid permission bitfield");
}

export function toWire(value: bigint): string {
  if (value < 0n) throw new Error("Permission bitfield must be unsigned");
  return value.toString(10);
}

export function hasPermission(mask: bigint, required: bigint): boolean {
  return (mask & required) === required;
}

export function resolveGuildPermissions(ctx: PermissionContext): bigint {
  if (ctx.userId === ctx.guildOwnerId) return ALL_PERMISSIONS;

  const byId = new Map(ctx.roles.map((role) => [role.id, role]));
  let mask = byId.get(ctx.everyoneRoleId)?.permissions ?? 0n;
  for (const roleId of ctx.memberRoleIds) mask |= byId.get(roleId)?.permissions ?? 0n;
  return hasPermission(mask, Permission.ADMINISTRATOR) ? ALL_PERMISSIONS : mask;
}

function applyOverwrite(mask: bigint, overwrite: PermissionOverwrite): bigint {
  return (mask & ~overwrite.deny) | overwrite.allow;
}

/** Discord-compatible ordering: @everyone, aggregated roles, then member override. */
export function resolveChannelPermissions(ctx: PermissionContext): bigint {
  let mask = resolveGuildPermissions(ctx);
  if (hasPermission(mask, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;

  const everyone = ctx.overwrites.find((o) => o.roleId === ctx.everyoneRoleId);
  if (everyone) mask = applyOverwrite(mask, everyone);

  const memberRoleIds = new Set(ctx.memberRoleIds);
  const roleDeny = ctx.overwrites
    .filter((o) => o.roleId && memberRoleIds.has(o.roleId))
    .reduce((value, o) => value | o.deny, 0n);
  const roleAllow = ctx.overwrites
    .filter((o) => o.roleId && memberRoleIds.has(o.roleId))
    .reduce((value, o) => value | o.allow, 0n);
  mask = (mask & ~roleDeny) | roleAllow;

  const member = ctx.overwrites.find((o) => o.userId === ctx.userId);
  return member ? applyOverwrite(mask, member) : mask;
}
