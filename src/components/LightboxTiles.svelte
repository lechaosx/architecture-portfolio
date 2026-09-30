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
    resting,
  }: {
    url: string;
    view: View;
    /** The drawing's size at 100%. */
    restImage: Size | undefined;
    stage: Size;
    /** Its card is at rest on it now. */
    resting: boolean;
  } = $props();

  let element: HTMLDivElement;
  let viewer = $state.raw<OpenSeadragon.Viewer>();
  let createViewer = $state.raw<typeof OpenSeadragon>();
  // The viewer is created only while the card rests, as creating it mid-move
  // stalls the move; its code loads lazily, and the card may have moved on
  // by the time it arrives. Once created, it stays while the card moves.
  let start = $state(false);

  void import('openseadragon').then((module) => (createViewer = module.default));

  $effect.pre(() => {
    if (createViewer && resting) start = true;
  });

  $effect(() => {
    const tileSources = url;
    const create = createViewer;
    if (!start || !create) return;
    // OpenSeadragon caches this module-wide, including while no viewer exists.
    Object.assign(create, {
      pixelDensityRatio: create.getCurrentPixelDensityRatio(),
    });
    const opening = create({
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
    opening.addHandler('open', () => (viewer = opening));
    return () => {
      opening.destroy();
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
