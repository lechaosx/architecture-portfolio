<script lang="ts">
  import type OpenSeadragon from 'openseadragon';
  import { deepZoomViewport, type Size, type View } from './gallery';

  // The tiled canvas of a deep-zoom drawing, laid out over the stage at the
  // drawing's view. OpenSeadragon selects, loads, caches and draws the tiles;
  // the view is the lightbox's, so its own navigation, constraints and
  // auto-resize are off (either would move the view away from the lightbox's
  // clamp) and it is handed the stage size with every view.
  let {
    url,
    view,
    restImage,
    stage,
  }: {
    url: string;
    view: View;
    /** The drawing's size at 100%. */
    restImage: Size | undefined;
    stage: Size;
  } = $props();

  let element: HTMLDivElement;
  let viewer = $state.raw<OpenSeadragon.Viewer>();

  $effect(() => {
    const tileSources = url;
    let cancelled = false;
    let created: OpenSeadragon.Viewer | undefined;
    void import('openseadragon').then(({ default: createViewer }) => {
      if (cancelled) return;
      // OpenSeadragon caches this module-wide, including while no viewer exists.
      Object.assign(createViewer, {
        pixelDensityRatio: createViewer.getCurrentPixelDensityRatio(),
      });
      const opening = createViewer({
        element,
        tileSources,
        mouseNavEnabled: false,
        keyboardNavEnabled: false,
        tabIndex: -1,
        showNavigationControl: false,
        showNavigator: false,
        autoResize: false,
        minPixelRatio: 0.5,
        animationTime: 0,
        immediateRender: true,
      });
      created = opening;
      opening.addHandler('open', () => (viewer = opening));
    });
    return () => {
      cancelled = true;
      created?.destroy();
      viewer = undefined;
    };
  });

  $effect(() => {
    if (!viewer || !restImage) return;
    const { viewport } = viewer;
    const containerSize = viewport.getContainerSize();
    if (containerSize.x !== stage.width || containerSize.y !== stage.height) {
      containerSize.x = stage.width;
      containerSize.y = stage.height;
      viewport.resize(containerSize);
    }
    const target = deepZoomViewport(
      viewport.getHomeBounds().getCenter(),
      stage.width,
      restImage.width * view.scale,
      view.pan,
    );
    const center = viewport.getCenter();
    center.x = target.center.x;
    center.y = target.center.y;
    viewport.zoomTo(target.zoom, undefined, true);
    viewport.panTo(center, true);
  });
</script>

<div bind:this={element} class="absolute inset-0"></div>
