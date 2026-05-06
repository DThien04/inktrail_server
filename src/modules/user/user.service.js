const prisma = require("../../config/prisma");

const normalizeText = (value) => String(value ?? "").trim();

const ALLOWED_ROLES = new Set(["admin", "reader"]);

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  role: user.role,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
});

const listAdminUsers = async ({ query, role }) => {
  const normalizedQuery = normalizeText(query);
  const normalizedRole = normalizeText(role).toLowerCase();

  const where = {
    ...(ALLOWED_ROLES.has(normalizedRole) ? { role: normalizedRole } : {}),
    ...(normalizedQuery
      ? {
          OR: [
            { email: { contains: normalizedQuery, mode: "insensitive" } },
            { displayName: { contains: normalizedQuery, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
  });

  return users.map(formatUser);
};

module.exports = {
  listAdminUsers,
};

