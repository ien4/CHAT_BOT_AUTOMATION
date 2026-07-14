function createListAdminUsers({ adminUsersRepository }) {
  return async function listAdminUsers(req, res) {
    try {
      const users = await adminUsersRepository.findMany();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListAdminUsers,
};
