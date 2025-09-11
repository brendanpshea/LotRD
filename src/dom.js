// src/dom.js
export function renderTemplate(root, id) {
  root.innerHTML = "";
  const tpl = document.getElementById(id);
  const node = tpl.content.cloneNode(true);
  root.appendChild(node);
  return root; // root now contains the rendered nodes
}

export function $(root, sel) {
  return root.querySelector(sel);
}

export function $all(root, sel) {
  return [...root.querySelectorAll(sel)];
}
