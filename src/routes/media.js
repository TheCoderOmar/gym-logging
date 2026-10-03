const express = require('express');

module.exports = (repo) => {
  const router = express.Router();

  router.get('/:id/:kind', (req, res) => {
    const kind = req.params.kind === 'gif' ? 'gif' : 'image';
    const media = repo.getMedia(req.params.id, kind);
    if (!media || !media.data) return res.status(404).end();
    // Custom exercises can have their media replaced, so cache them briefly.
    const maxAge = req.params.id.startsWith('C') ? 60 : 60 * 60 * 24 * 30;
    res.set('Content-Type', media.mime || 'application/octet-stream');
    res.set('Cache-Control', `public, max-age=${maxAge}`);
    res.send(Buffer.from(media.data));
  });

  return router;
};
