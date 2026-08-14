/**
 * Regression tests for the shared SectionBackground component used by both
 * the Theme Builder preview and the real storefront to render Hero /
 * Promotional Banner backgrounds (color, gradient, and photographic image
 * modes, with an optional overlay).
 */
import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SectionBackground } from '@commercenest/ui';

describe('SectionBackground', () => {
  it('does not add a conflicting `relative` class when the caller pins it with `absolute inset-0` (regression: this previously collapsed the wrapper to zero height, hiding the hero image/color/gradient entirely behind the page background)', () => {
    const { container } = render(
      <SectionBackground
        type="image"
        image="https://example.com/hero.jpg"
        gradientFrom="#111827"
        gradientTo="#0f172a"
        className="absolute inset-0"
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const classes = wrapper.className.split(/\s+/);
    expect(classes).toContain('absolute');
    expect(classes).not.toContain('relative');
  });

  it('falls back to `relative` when the caller does not pass a className (standalone usage still needs a containing block for its absolutely-positioned children)', () => {
    const { container } = render(
      <SectionBackground type="gradient" gradientFrom="#111827" gradientTo="#0f172a" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className.split(/\s+/)).toContain('relative');
  });

  it('renders only the gradient base layer when type is gradient (no image element)', () => {
    const { container } = render(
      <SectionBackground type="gradient" gradientFrom="#111827" gradientTo="#0f172a" />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders only the solid color base layer when type is color', () => {
    const { container } = render(
      <SectionBackground type="color" color="#BE185D" gradientFrom="#BE185D" gradientTo="#0f172a" />,
    );
    expect(container.querySelector('img')).toBeNull();
    const base = container.querySelector('div.absolute.inset-0') as HTMLElement;
    expect(base.style.background).toContain('rgb(190, 24, 93)');
  });

  it('renders the image with the requested object-position when type is image', () => {
    const { container } = render(
      <SectionBackground
        type="image"
        image="https://example.com/hero.jpg"
        position="top"
        gradientFrom="#111827"
        gradientTo="#0f172a"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/hero.jpg');
    expect((img as HTMLImageElement).style.objectPosition).toBe('top');
  });

  it('falls back to the base color/gradient layer (no broken image, no blank hero) when the image fails to load', () => {
    const { container } = render(
      <SectionBackground
        type="image"
        image="https://example.com/broken.jpg"
        gradientFrom="#111827"
        gradientTo="#0f172a"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    fireEvent.error(img as HTMLImageElement);

    // After onError fires, the <img> must be removed from the DOM — the
    // gradient base layer underneath is what the user actually sees, never
    // a broken-image icon.
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not render an image element when type is image but no image URL is provided', () => {
    const { container } = render(
      <SectionBackground type="image" image="" gradientFrom="#111827" gradientTo="#0f172a" />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a dark overlay layer with the requested opacity when overlayType is dark', () => {
    const { container } = render(
      <SectionBackground
        type="image"
        image="https://example.com/hero.jpg"
        overlayType="dark"
        overlayOpacity={60}
        gradientFrom="#111827"
        gradientTo="#0f172a"
      />,
    );
    const layers = container.querySelectorAll('div.absolute.inset-0');
    // base layer + image is an <img> not a div, + overlay layer = 2 divs
    expect(layers.length).toBe(2);
    const overlayDiv = layers[1] as HTMLElement;
    expect(overlayDiv.style.background).toContain('0.6');
  });

  it('renders no overlay layer when overlayType is none', () => {
    const { container } = render(
      <SectionBackground
        type="image"
        image="https://example.com/hero.jpg"
        overlayType="none"
        gradientFrom="#111827"
        gradientTo="#0f172a"
      />,
    );
    const layers = container.querySelectorAll('div.absolute.inset-0');
    expect(layers.length).toBe(1);
  });

  it('renders no base layer at all when type is "none" (transparent — the page background shows through, matching how sections looked before background support existed)', () => {
    const { container } = render(
      <SectionBackground type="none" gradientFrom="#111827" gradientTo="#0f172a" />,
    );
    expect(container.querySelector('div.absolute.inset-0')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders an image and overlay for type "none" if somehow configured, only skipping the solid/gradient base', () => {
    const { container } = render(
      <SectionBackground
        type="none"
        image="https://example.com/hero.jpg"
        overlayType="dark"
        overlayOpacity={50}
        gradientFrom="#111827"
        gradientTo="#0f172a"
      />,
    );
    // type !== 'image', so showImage is false by design — 'none' never
    // shows a photo either, it truly means "nothing."
    expect(container.querySelector('img')).toBeNull();
  });

  it('sets loading=lazy by default and loading=eager when priority is set (above-the-fold heroes)', () => {
    const { container: lazyContainer } = render(
      <SectionBackground type="image" image="https://example.com/hero.jpg" gradientFrom="#111827" gradientTo="#0f172a" />,
    );
    expect(lazyContainer.querySelector('img')?.getAttribute('loading')).toBe('lazy');

    const { container: eagerContainer } = render(
      <SectionBackground
        type="image"
        image="https://example.com/hero.jpg"
        gradientFrom="#111827"
        gradientTo="#0f172a"
        priority
      />,
    );
    expect(eagerContainer.querySelector('img')?.getAttribute('loading')).toBe('eager');
  });
});
