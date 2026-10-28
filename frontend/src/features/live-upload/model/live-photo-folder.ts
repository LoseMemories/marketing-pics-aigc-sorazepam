export interface LivePhotoFilePair {
  key: string;
  displayName: string;
  still: File;
  motion: File;
}

export interface LivePhotoFolderScan {
  pairs: LivePhotoFilePair[];
  incompleteCount: number;
  ambiguousCount: number;
}

const stillExtensions = new Set(["heic", "heif", "jpg", "jpeg"]);
const motionExtensions = new Set(["mov"]);

interface CandidateGroup {
  key: string;
  displayName: string;
  stills: File[];
  motions: File[];
}

function fileIdentity(file: File): { key: string; displayName: string; extension: string } {
  const relativePath = file.webkitRelativePath || file.name;
  const slashIndex = relativePath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : "";
  const filename = slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath;
  const dotIndex = filename.lastIndexOf(".");
  const displayName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : "";
  return {
    key: `${directory}${displayName}`.toLocaleLowerCase(),
    displayName,
    extension
  };
}

export function scanLivePhotoFiles(files: readonly File[]): LivePhotoFolderScan {
  const groups = new Map<string, CandidateGroup>();
  for (const file of files) {
    const identity = fileIdentity(file);
    const isStill = stillExtensions.has(identity.extension);
    const isMotion = motionExtensions.has(identity.extension);
    if (!isStill && !isMotion) continue;
    const group = groups.get(identity.key) ?? {
      key: identity.key,
      displayName: identity.displayName,
      stills: [],
      motions: []
    };
    if (isStill) group.stills.push(file);
    if (isMotion) group.motions.push(file);
    groups.set(identity.key, group);
  }

  const pairs: LivePhotoFilePair[] = [];
  let incompleteCount = 0;
  let ambiguousCount = 0;
  for (const group of groups.values()) {
    if (group.stills.length === 1 && group.motions.length === 1) {
      pairs.push({
        key: group.key,
        displayName: group.displayName,
        still: group.stills[0]!,
        motion: group.motions[0]!
      });
    } else if (group.stills.length > 1 || group.motions.length > 1) {
      ambiguousCount += 1;
    } else {
      incompleteCount += 1;
    }
  }
  return {
    pairs: pairs.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    incompleteCount,
    ambiguousCount
  };
}
