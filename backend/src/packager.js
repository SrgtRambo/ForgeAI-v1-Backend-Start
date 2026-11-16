// Builds the delivery zip in memory (no temp folders, no npm install on the server).
import JSZip from 'jszip';
import { slug } from './archetypes.js';

export async function buildZip(projectName, files) {
  const zip = new JSZip();
  const root = zip.folder(slug(projectName));
  for (const [path, content] of Object.entries(files)) root.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
