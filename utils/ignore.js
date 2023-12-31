// add package-lock.json and yarn.lock to ignore patterns also exclude all image files
const ignorePatterns = [
  /\.(lock)$|(-lock\.yaml)$/,
  /package-lock.json/,
  /yarn.lock/,
  /\.git/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.svg$/,
  /\.pdf$/,
  /\.doc$/,
  /\.docx$/,
  /\.xls$/,
  /\.xlsx$/,
  /\.ppt$/,
  /\.pptx$/,
  /\.mp3$/,
  /\.mp4$/,
  /\.wav$/,
  /\.zip$/,
  /\.tar$/,
  /\.gz$/,
  /\.bz2$/,
  /\.rar$/,
  /\.7z$/,
  /\.exe$/,
  /\.dmg$/,
  /\.apk$/,
  /\.jar$/,
  /\.war$/,
  /\.deb$/,
  /\.rpm$/,
  /\.msi$/,
  /\.img$/,
  /\.iso$/,
  /\.bin$/,
  /\.csv$/,
  /\.tsv$/,
  /\.dat$/,
  /\.db$/,
  /\.db\.lock$/,
  /\.db-shm$/,
  /\.db-wal$/,
  /\.vscode/,
  /__pycache__/,
  /\.sf3$/,
  /\.sfd$/,
  /\.woff$/,
  /\.woff2$/,
  /\.eot$/,
  /\.ttf$/,
  /\.otf$/,
  /\.class$/,
  /\.swf$/,
  /\.fla$/,
  /\.flv$/,
  /\.wmv$/,
  /\.avi$/,
  /\.mov$/,
  /\.mpg$/,
  /\.mpeg$/,
  /\.mkv$/,
  /\.webm$/,
  /\.m4v$/,
  /\.m4a$/,
  /\.m4p$/,
  /\.m4b$/,
  /\.m4r$/,
  /\.3gp$/,
  /\.aac$/,
  /\.opus$/,
  /\.ogg$/,
  /\.oga$/,
  /\.ogv$/,
  /\.ogx$/,
  /\.ogm$/,
  /\.srt$/,
  /\.vtt$/,
  /\.ass$/,
  /\.ssa$/,
  /\.ass$/,
];

export default function shouldIgnore(file) {
  return ignorePatterns.some((pattern) => pattern.test(file));
}
