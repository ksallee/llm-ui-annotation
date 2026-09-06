/** Drop targets for file drags. Text dragged around the host page is never touched. */

export function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types ? Array.from(types).includes('Files') : false;
}

export function filesOf(event: DragEvent | ClipboardEvent): File[] {
  const data = 'dataTransfer' in event ? event.dataTransfer : event.clipboardData;
  return data ? Array.from(data.files) : [];
}

export interface DropAction {
  update(next: (files: File[]) => void): void;
  destroy(): void;
}

/** Marks the node `.dropping` while files are over it and hands them over on drop. */
export function fileDrop(node: HTMLElement, ondrop: (files: File[]) => void): DropAction {
  let take = ondrop;
  let depth = 0;

  const mark = (on: boolean): void => {
    // annot-allow-host-mutation: the node is an overlay element the action was placed on
    node.classList.toggle('dropping', on);
  };

  const enter = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    depth++;
    mark(true);
  };

  const over = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    mark(true);
  };

  const leave = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) mark(false);
  };

  const drop = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    depth = 0;
    mark(false);
    take(filesOf(event));
  };

  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);

  return {
    update(next) {
      take = next;
    },
    destroy() {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    },
  };
}
