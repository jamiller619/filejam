export interface IconLibrary {
  name: string

  applications: string
  back: string
  check: string
  close: string
  collection: string
  columns: string
  columnView: string
  copy: string
  cut: string
  desktop: string
  document: string
  down: string
  download: string
  folder: string
  forward: string
  grid: string
  hardDrive: string
  heart: string
  heartFilled: string
  hideDetails: string
  home: string
  image: string
  info: string
  library: string
  list: string
  masonry: string
  more: string
  move: string
  music: string
  paste: string
  plus: string
  preview: string
  recent: string
  refresh: string
  rename: string
  search: string
  settings: string
  showDetails: string
  trash: string
  up: string
  upDown: string
  user: string
  video: string
}

export const def: IconLibrary = {
  name: 'keyline-icons',

  applications: 'grid-squares',
  back: 'chevron-left',
  check: 'check',
  close: 'x',
  collection: 'gallery-horizontal-end', // or 'layers'
  columns: 'table',
  columnView: 'columns-3',
  copy: 'copy',
  cut: 'scissors',
  desktop: 'monitor',
  document: 'file',
  down: 'chevron-down',
  download: 'download',
  folder: 'folder',
  forward: 'chevron-right',
  grid: 'grid-squares',
  hardDrive: 'hard-drive',
  heart: 'heart',
  heartFilled: 'heart-fill',
  hideDetails: 'panel-right-close',
  home: 'home',
  image: 'image',
  info: 'info',
  library: 'book-open-2',
  list: 'list',
  masonry: 'layout-dashboard',
  more: 'more-horizontal',
  move: 'move',
  music: 'music-note',
  paste: 'clipboard-paste',
  plus: 'plus',
  preview: 'eye',
  recent: 'history',
  refresh: 'rotate-cw',
  rename: 'text-cursor-input',
  search: 'search',
  settings: 'cog',
  showDetails: 'panel-right-open',
  trash: 'bin-2',
  // up: 'chevron-up',
  up: 'corner-left-up',
  upDown: 'chevrons-up-down',
  user: 'circle-user',
  video: 'video-2',
}
