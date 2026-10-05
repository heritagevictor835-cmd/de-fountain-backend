// Fields safe to return for a User — everything except passwordHash.
// Use this with `select` (or nested `select` on an `include`d relation) any time
// a User or a relation that reaches a User goes back out over the API.
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
};

module.exports = { SAFE_USER_SELECT };
