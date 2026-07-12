function createListCampaigns({ campaignsRepository }) {
  return async function listCampaigns(req, res) {
    try {
      const campaigns = await campaignsRepository.findMany();
      res.json(campaigns);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function createGetCampaign({ campaignsRepository }) {
  return async function getCampaign(req, res) {
    try {
      const campaign = await campaignsRepository.findById({ id: req.params.id });
      if (!campaign) return res.status(404).json({ error: 'Not found' });
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListCampaigns,
  createGetCampaign,
};
