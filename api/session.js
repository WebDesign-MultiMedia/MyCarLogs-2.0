// GET /api/session → { authed, drive } so the page knows whether to show the sign-in screen.
const { isAuthed, send } = require('./_lib');

module.exports = (req, res) => {
    const authed = isAuthed(req);
    send(res, 200, {
        authed,
        drive: authed && !!(process.env.DRIVE_SCRIPT_URL && process.env.DRIVE_UPLOAD_KEY)
    });
};
