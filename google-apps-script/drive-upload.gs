/**
 * MyCarLogs — Scan report uploader (Google Apps Script)
 *
 * Receives a scan report (PDF or image) from the MyCarLogs site and saves it to a
 * folder in YOUR Google Drive. Files stay private: only your Google account can open them.
 *
 * Setup (once): see README → "Scan Reports setup".
 *   1. Go to https://script.google.com → New project → paste this whole file.
 *   2. Change UPLOAD_KEY below to your own secret phrase.
 *   3. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *   4. Authorize, then copy the Web app URL (ends in /exec).
 *   5. In MyCarLogs → Scans → Google Drive, paste the URL and your UPLOAD_KEY.
 */

const UPLOAD_KEY = 'CHANGE-ME-to-a-long-secret-phrase';
const FOLDER_NAME = 'MyCarLogs Scan Reports';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.key !== UPLOAD_KEY) return reply({ ok: false, error: 'unauthorized' });
    if (ALLOWED_TYPES.indexOf(body.mimeType) === -1) return reply({ ok: false, error: 'file type not allowed' });

    const bytes = Utilities.base64Decode(body.data);
    if (bytes.length > MAX_BYTES) return reply({ ok: false, error: 'file too large' });

    const name = String(body.name || 'scan-report').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
    const file = getFolder().createFile(Utilities.newBlob(bytes, body.mimeType, name));
    return reply({ ok: true, id: file.getId(), url: file.getUrl(), name: file.getName() });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// Lets you open the /exec URL in a browser to confirm the deployment works.
function doGet() {
  return reply({ ok: true, service: 'MyCarLogs scan uploader' });
}

function getFolder() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
