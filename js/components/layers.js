// ============================================================================
// Layers component: keyed rows, selection, deletion, and drag previews
// ============================================================================

export function createLayersComponent({
  listElement,
  layerService,
  editorService
}) {
  const lifetime = new AbortController();
  const rowViews = new Map();
  let activeDrag = null;

  // Create a row once; its handlers resolve current data by ID through services.
  function createRow(layer) {
    const rowLifetime = new AbortController();
    const rowElement = document.createElement('li');
    rowElement.className = 'layer';
    rowElement.dataset.layerId = layer.id;

    const dragButton = document.createElement('button');
    dragButton.type = 'button';
    dragButton.className = 'grip';
    dragButton.textContent = '⠿';
    dragButton.title = 'Drag to reorder';

    const nameElement = document.createElement('span');
    nameElement.className = 'name';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete';
    deleteButton.textContent = '×';

    const view = {
      layerId: layer.id,
      rowElement,
      dragButton,
      nameElement,
      deleteButton,
      lifetime: rowLifetime
    };

    dragButton.addEventListener('pointerdown', (pointerEvent) => {
      startLayerDrag(pointerEvent, view);
    }, {
      signal: rowLifetime.signal
    });

    nameElement.addEventListener('click', () => {
      editorService.selectLayer(layer.id);
    }, {
      signal: rowLifetime.signal
    });

    deleteButton.addEventListener('click', () => {
      layerService.removeLayer(layer.id);
    }, {
      signal: rowLifetime.signal
    });

    rowElement.append(dragButton, nameElement, deleteButton);
    return view;
  }

  // Update row contents and selection without replacing captured drag targets.
  function render() {
    const layers = layerService.getLayers();
    const editorState = editorService.getState();
    const currentIds = new Set(layers.map((layer) => layer.id));

    // Structural changes during a drag invalidate its original row slots.
    if (activeDrag !== null) {
      const membershipChanged = layers.length !== activeDrag.originalOrder.length
        || activeDrag.originalOrder.some((layerId) => !currentIds.has(layerId));

      if (membershipChanged) {
        finishLayerDrag(false);
        return;
      }
    }

    listElement.style.setProperty('--selection-color', editorState.selectionOutlineColor);

    for (const [layerId, view] of rowViews) {
      if (!currentIds.has(layerId)) {
        view.lifetime.abort();
        view.rowElement.remove();
        rowViews.delete(layerId);
      }
    }

    layers.forEach((layer, layerIndex) => {
      if (!rowViews.has(layer.id)) {
        rowViews.set(layer.id, createRow(layer));
      }

      const view = rowViews.get(layer.id);
      view.nameElement.textContent = layer.name;
      view.dragButton.setAttribute('aria-label', `Reorder ${layer.name}`);
      view.deleteButton.title = `Delete ${layer.name}`;
      view.rowElement.classList.toggle('active', layer.id === editorState.selectedLayerId);

      if (activeDrag === null) {
        view.rowElement.style.removeProperty('transform');
        const currentElement = listElement.children[layerIndex] ?? null;

        if (currentElement !== view.rowElement) {
          listElement.insertBefore(view.rowElement, currentElement);
        }
      }
    });

    if (activeDrag !== null) {
      renderDragPreview(layers);
    }
  }

  // Keep DOM slots stable and animate visual positions around the placeholder.
  function renderDragPreview(layers) {
    const targetIndex = layers.findIndex((layer) => layer.id === activeDrag.view.layerId);
    activeDrag.placeholder.style.transform = `translateY(${targetIndex * activeDrag.rowHeight}px)`;

    layers.forEach((layer, layerIndex) => {
      if (layer.id === activeDrag.view.layerId) {
        return;
      }

      const originalIndex = activeDrag.originalOrder.indexOf(layer.id);
      const verticalOffset = (layerIndex - originalIndex) * activeDrag.rowHeight;
      rowViews.get(layer.id).rowElement.style.transform = `translateY(${verticalOffset}px)`;
    });
  }

  // Begin a drag with component-local transient state and pointer capture.
  function startLayerDrag(pointerEvent, view) {
    if (pointerEvent.button !== 0 || activeDrag !== null) {
      return;
    }

    pointerEvent.preventDefault();
    const originalOrder = layerService.getLayers().map((layer) => layer.id);
    const placeholder = document.createElement('li');
    placeholder.className = 'placeholder';
    placeholder.setAttribute('aria-hidden', 'true');

    activeDrag = {
      view,
      pointerId: pointerEvent.pointerId,
      originalOrder,
      originalIndex: originalOrder.indexOf(view.layerId),
      startPointerY: pointerEvent.clientY,
      latestPointerY: pointerEvent.clientY,
      startScrollTop: listElement.scrollTop,
      rowHeight: view.rowElement.offsetHeight,
      placeholder,
      lifetime: new AbortController()
    };

    listElement.append(placeholder);
    view.rowElement.classList.add('dragging');
    view.dragButton.setPointerCapture(pointerEvent.pointerId);
    const dragSignal = activeDrag.lifetime.signal;

    view.dragButton.addEventListener('pointermove', (moveEvent) => {
      if (activeDrag !== null && moveEvent.pointerId === activeDrag.pointerId) {
        activeDrag.latestPointerY = moveEvent.clientY;
        moveDraggedLayer();
      }
    }, {
      signal: dragSignal
    });

    // Release commits live changes. Cancellation restores the pre-drag order.
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      view.dragButton.addEventListener(eventName, (endEvent) => {
        if (activeDrag !== null && endEvent.pointerId === activeDrag.pointerId) {
          finishLayerDrag(eventName === 'pointercancel');
        }
      }, {
        signal: dragSignal
      });
    }

    renderDragPreview(layerService.getLayers());
  }

  // Service order changes as soon as a new slot is crossed, before release.
  function moveDraggedLayer() {
    const dragDistance = activeDrag.latestPointerY - activeDrag.startPointerY
      + listElement.scrollTop - activeDrag.startScrollTop;
    const targetIndex = Math.round(
      activeDrag.originalIndex + dragDistance / activeDrag.rowHeight
    );

    activeDrag.view.rowElement.style.transform = `translateY(${dragDistance}px)`;
    layerService.moveLayer(activeDrag.view.layerId, targetIndex);
    renderDragPreview(layerService.getLayers());
  }

  // End capture before restoring order so subscriptions can render normally.
  function finishLayerDrag(restoreOrder) {
    if (activeDrag === null) {
      return;
    }

    const completedDrag = activeDrag;
    activeDrag = null;
    completedDrag.lifetime.abort();
    completedDrag.placeholder.remove();
    completedDrag.view.rowElement.classList.remove('dragging');

    if (completedDrag.view.dragButton.hasPointerCapture(completedDrag.pointerId)) {
      completedDrag.view.dragButton.releasePointerCapture(completedDrag.pointerId);
    }

    if (restoreOrder) {
      completedDrag.originalOrder.forEach((layerId, layerIndex) => {
        layerService.moveLayer(layerId, layerIndex);
      });
    }

    render();
  }

  listElement.addEventListener('scroll', () => {
    if (activeDrag !== null) {
      moveDraggedLayer();
    }
  }, {
    signal: lifetime.signal
  });

  listElement.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Escape' && activeDrag !== null) {
      finishLayerDrag(true);
    }
  }, {
    signal: lifetime.signal
  });

  const unsubscribeLayers = layerService.subscribe(render);
  const unsubscribeEditor = editorService.subscribe(render);
  render();

  // Release subscriptions, pointer capture, and all row handlers on teardown.
  function destroy() {
    unsubscribeLayers();
    unsubscribeEditor();
    finishLayerDrag(false);
    lifetime.abort();

    for (const view of rowViews.values()) {
      view.lifetime.abort();
      view.rowElement.remove();
    }

    rowViews.clear();
  }

  return {
    destroy
  };
}
