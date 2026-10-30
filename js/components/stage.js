import { clampNumber, copyNodes } from '../models.js';

// ============================================================================
// Stage component: owns DOM views, hover state, and endpoint drag gestures
// ============================================================================

export function createStageComponent({
  stageElement,
  editorService,
  layerService,
  stageService
}) {
  const lifetime = new AbortController();
  const lineViews = new Map();
  let activeDrag = null;

  // Create a view once per layer. Data stays entirely in LayerService.
  function createLineView(layer) {
    const viewLifetime = new AbortController();
    const element = document.createElement('div');
    element.className = 'line';
    element.dataset.layerId = layer.id;

    const stroke = document.createElement('div');
    stroke.className = 'stroke';
    const handles = [document.createElement('div'), document.createElement('div')];

    handles.forEach((handle) => {
      handle.className = 'handle';
    });

    const view = {
      layerId: layer.id,
      element,
      stroke,
      handles,
      lifetime: viewLifetime
    };

    bindPartEvents(view, stroke, null);
    handles.forEach((handle, nodeIndex) => {
      bindPartEvents(view, handle, nodeIndex);
    });

    element.append(stroke, ...handles);
    return view;
  }

  // Selection goes through EditorService; only handles initiate node dragging.
  function bindPartEvents(view, partElement, nodeIndex) {
    partElement.addEventListener('pointerenter', () => {
      view.element.classList.add('hover');
    }, {
      signal: view.lifetime.signal
    });

    partElement.addEventListener('pointerleave', () => {
      view.element.classList.remove('hover');
    }, {
      signal: view.lifetime.signal
    });

    partElement.addEventListener('pointerdown', (pointerEvent) => {
      if (pointerEvent.button !== 0 || activeDrag !== null) {
        return;
      }

      pointerEvent.stopPropagation();
      editorService.selectLayer(view.layerId);

      if (nodeIndex !== null) {
        startHandleDrag(pointerEvent, view, nodeIndex);
      }
    }, {
      signal: view.lifetime.signal
    });
  }

  // Geometry and fill are dynamic; outline alpha is deliberately independent.
  function renderLine(view, lineData) {
    const [startNode, endNode] = lineData.nodes;
    const horizontalDistance = endNode.x - startNode.x;
    const verticalDistance = endNode.y - startNode.y;
    const lineLength = Math.hypot(horizontalDistance, verticalDistance);
    const lineAngle = Math.atan2(verticalDistance, horizontalDistance);
    const fillAlpha = Math.round(lineData.opacity / 100 * 255).toString(16).padStart(2, '0');

    view.element.style.setProperty('--line-width', `${lineData.thickness}px`);
    view.element.style.setProperty('--line-fill', `${lineData.color}${fillAlpha}`);
    view.stroke.style.left = `${startNode.x}px`;
    view.stroke.style.top = `${startNode.y - lineData.thickness / 2}px`;
    view.stroke.style.width = `${lineLength}px`;
    view.stroke.style.transform = `rotate(${lineAngle}rad)`;

    lineData.nodes.forEach((node, nodeIndex) => {
      view.handles[nodeIndex].style.left = `${node.x}px`;
      view.handles[nodeIndex].style.top = `${node.y}px`;
    });
  }

  // Reconcile by ID. Unchanged order never reparents a captured handle's line.
  function render() {
    const layers = layerService.getLayers();
    const editorState = editorService.getState();
    const existingIds = new Set(layers.map((layer) => layer.id));

    if (activeDrag !== null && (
      !existingIds.has(activeDrag.layerId)
      || editorState.selectedLayerId !== activeDrag.layerId
    )) {
      finishHandleDrag();
    }

    stageElement.style.setProperty('--selection-color', editorState.selectionOutlineColor);
    stageElement.style.setProperty('--outline-thickness', `${editorState.outlineThickness}px`);
    stageElement.style.setProperty('--handle-size', `${editorState.handleSize}px`);

    for (const [layerId, view] of lineViews) {
      if (!existingIds.has(layerId)) {
        view.lifetime.abort();
        view.element.remove();
        lineViews.delete(layerId);
      }
    }

    const backToFront = [...layers].reverse();

    backToFront.forEach((layer, layerIndex) => {
      if (!lineViews.has(layer.id)) {
        lineViews.set(layer.id, createLineView(layer));
      }

      const view = lineViews.get(layer.id);
      renderLine(view, layer.object.data);
      view.element.classList.toggle('selected', layer.id === editorState.selectedLayerId);
      const currentElement = stageElement.children[layerIndex] ?? null;

      if (currentElement !== view.element) {
        stageElement.insertBefore(view.element, currentElement);
      }
    });
  }

  // Keep the original grab offset, but fetch fresh node data for every update.
  function startHandleDrag(pointerEvent, view, nodeIndex) {
    pointerEvent.preventDefault();
    const layer = layerService.getLayer(view.layerId);
    const node = layer.object.data.nodes[nodeIndex];
    const bounds = stageElement.getBoundingClientRect();
    const handle = view.handles[nodeIndex];

    activeDrag = {
      layerId: view.layerId,
      nodeIndex,
      handle,
      pointerId: pointerEvent.pointerId,
      horizontalGrabOffset: pointerEvent.clientX - bounds.left - node.x,
      verticalGrabOffset: pointerEvent.clientY - bounds.top - node.y,
      lifetime: new AbortController()
    };

    handle.setPointerCapture(pointerEvent.pointerId);
    const dragSignal = activeDrag.lifetime.signal;
    handle.addEventListener('pointermove', moveHandle, {
      signal: dragSignal
    });

    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      handle.addEventListener(eventName, (endEvent) => {
        if (activeDrag !== null && endEvent.pointerId === activeDrag.pointerId) {
          finishHandleDrag();
        }
      }, {
        signal: dragSignal
      });
    }
  }

  // Update a copied node pair through LayerService, never mutate a snapshot.
  function moveHandle(pointerEvent) {
    if (activeDrag === null || pointerEvent.pointerId !== activeDrag.pointerId) {
      return;
    }

    const layer = layerService.getLayer(activeDrag.layerId);

    if (layer === null) {
      finishHandleDrag();
      return;
    }

    const bounds = stageElement.getBoundingClientRect();
    const size = stageService.getSize();
    const nodes = copyNodes(layer.object.data.nodes);
    nodes[activeDrag.nodeIndex] = {
      x: clampNumber(pointerEvent.clientX - bounds.left - activeDrag.horizontalGrabOffset, 0, size.width),
      y: clampNumber(pointerEvent.clientY - bounds.top - activeDrag.verticalGrabOffset, 0, size.height)
    };

    layerService.updateLayer(activeDrag.layerId, {
      data: {
        nodes
      }
    });
  }

  // Release listeners/capture when a gesture ends or its layer disappears.
  function finishHandleDrag() {
    if (activeDrag === null) {
      return;
    }

    const completedDrag = activeDrag;
    activeDrag = null;
    completedDrag.lifetime.abort();

    if (completedDrag.handle.hasPointerCapture(completedDrag.pointerId)) {
      completedDrag.handle.releasePointerCapture(completedDrag.pointerId);
    }
  }

  stageElement.addEventListener('pointerdown', (pointerEvent) => {
    if (pointerEvent.target === stageElement) {
      editorService.clearSelection();
    }
  }, {
    signal: lifetime.signal
  });

  const unsubscribeLayers = layerService.subscribe(render);
  const unsubscribeEditor = editorService.subscribe(render);
  render();

  function destroy() {
    unsubscribeLayers();
    unsubscribeEditor();
    finishHandleDrag();
    lifetime.abort();

    for (const view of lineViews.values()) {
      view.lifetime.abort();
      view.element.remove();
    }

    lineViews.clear();
  }

  return {
    destroy
  };
}
