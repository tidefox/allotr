// Things that do not work inside a shadow root go to document.head, once per
// page, and are removed again on unload.
import { fontCss, propertyCss } from 'virtual:css';

const IDS = {
  fonts: 'allotr-spike-fonts',
  properties: 'allotr-spike-properties',
  racPressable: 'react-aria-pressable-style',
} as const;

let users = 0;

export function installHeadStyles(doc: Document): void {
  users++;
  if (users > 1) return;
  // @font-face is ignored inside shadow roots. Family names are Allotr's own.
  const fonts = doc.createElement('style');
  fonts.id = IDS.fonts;
  fonts.textContent = fontCss;
  // @property registrations are ignored inside shadow roots too; without them
  // Tailwind's --tw-* defaults are missing and borders/transforms break.
  const props = doc.createElement('style');
  props.id = IDS.properties;
  props.textContent = propertyCss;
  doc.head.append(fonts, props);
  // React Aria injects an inline <style> unless this element exists; the
  // rule it would add is already part of the app CSS.
  if (doc.getElementById(IDS.racPressable) === null) {
    const marker = doc.createElement('template');
    marker.id = IDS.racPressable;
    doc.head.append(marker);
  }
}

export function removeHeadStyles(doc: Document): void {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  doc.getElementById(IDS.fonts)?.remove();
  doc.getElementById(IDS.properties)?.remove();
  // Only remove the marker if we added it (it is a <template>, ours).
  const marker = doc.getElementById(IDS.racPressable);
  if (marker?.tagName === 'TEMPLATE') marker.remove();
}
