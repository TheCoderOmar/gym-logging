const express = require('express');

module.exports = (repo) => {
  const router = express.Router();

  router.get('/:id/:kind', (req, res) => {
    const kind = req.params.kind === 'gif' ? 'gif' : 'image';
    const media = repo.getMedia(req.params.id, kind);
    if (!media || !media.data) return res.status(404).end();
    // Media can be replaced at the same URL (custom uploads, the sharper liftmanual imports), so the
    // browser revalidates every time; Express's ETag turns repeat loads into a cheap 304.
    res.set('Content-Type', media.mime || 'application/octet-stream');
    res.set('Cache-Control', 'no-cache');
    res.send(Buffer.from(media.data));
  });

  return router;
};
