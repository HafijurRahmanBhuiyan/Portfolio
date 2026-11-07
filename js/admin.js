(function () {
  'use strict';

  /* --- order helpers (unit-tested; keep markers in sync with tests) --- */
  function cloneList(list) {
    return list.map(function (project) {
      var copy = Object.assign({}, project);
      if (Array.isArray(project.tags)) copy.tags = project.tags.slice();
      return copy;
    });
  }
  function sameOrder(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    for (var i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
    return true;
  }
  function moveItem(list, from, to) {
    if (!Array.isArray(list)) return list;
    if (from < 0 || from >= list.length) return list;
    if (to < 0 || to >= list.length) return list;
    if (from === to) return list;
    var next = list.slice();
    var moved = next.splice(from, 1)[0];
    next.splice(to, 0, moved);
    return next;
  }
  function reorderById(list, draggedId, targetId, after) {
    if (draggedId === targetId) return list.slice();
    var next = list.slice(),
      from = -1,
      i;
    for (i = 0; i < next.length; i++) if (next[i].id === draggedId) from = i;
    if (from < 0) return list.slice();
    var moved = next.splice(from, 1)[0];
    var targetIndex = -1;
    for (i = 0; i < next.length; i++)
      if (next[i].id === targetId) targetIndex = i;
    if (targetIndex < 0) return list.slice();
    next.splice(targetIndex + (after ? 1 : 0), 0, moved);
    return next;
  }
  /* --- end order helpers --- */

  var MAX_LOGO_BYTES = 2 * 1024 * 1024,
    LOGO_TYPES = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    },
    EXTENSION_TYPES = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    },
    items = [],
    committedItems = [],
    editingProject = null,
    pendingLogoPath = '',
    previewReader = null,
    form = document.getElementById('projectForm'),
    message = document.getElementById('message'),
    list = document.getElementById('projectList'),
    logoInput = document.getElementById('logoInput'),
    logoPreview = document.getElementById('logoPreview'),
    logoPreviewImage = document.getElementById('logoPreviewImage'),
    logoPreviewText = document.getElementById('logoPreviewText'),
    saveOrderButton = document.getElementById('saveOrder'),
    orderStatus = document.getElementById('orderStatus'),
    csrfToken = '',
    etag = '',
    formDirty = false,
    orderDirty = false,
    saving = false,
    draggedId = '',
    dragStartItems = null,
    dropHandled = false,
    rowIds = new WeakMap();

  function say(text, state) {
    message.textContent = text;
    if (state) message.setAttribute('data-state', state);
    else message.removeAttribute('data-state');
  }

  function signedOut() {
    csrfToken = '';
    document.getElementById('dashboard').hidden = true;
    document.getElementById('loginPanel').hidden = false;
  }

  function safeImagePath(value) {
    if (typeof value !== 'string') return '';
    var image = value.trim();
    if (!image) return '';
    if (
      /^\/?assets\/[A-Za-z0-9_./-]+$/.test(image) &&
      !image.split('/').includes('..')
    )
      return image;
    if (/^\/?api\/uploads\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)$/.test(image))
      return image;
    return '';
  }

  function previewSource(value) {
    var image = safeImagePath(value);
    if (!image) return '';
    return image.charAt(0) === '/' ? image : '/' + image;
  }

  function logoType(file) {
    if (!file) return '';
    var type = String(file.type || '').toLowerCase();
    if (LOGO_TYPES[type]) return type;
    var match = /\.([a-z0-9]+)$/i.exec(String(file.name || ''));
    return match ? EXTENSION_TYPES[match[1].toLowerCase()] || '' : '';
  }

  function fileSizeLabel(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function cancelPreviewRead() {
    if (!previewReader) return;
    try {
      previewReader.abort();
    } catch (_) {}
    previewReader = null;
  }

  function clearPreview() {
    cancelPreviewRead();
    if (logoPreview) logoPreview.hidden = true;
    if (logoPreviewImage) {
      logoPreviewImage.removeAttribute('src');
      logoPreviewImage.alt = '';
    }
    if (logoPreviewText) logoPreviewText.textContent = '';
  }

  function showExistingLogo() {
    var image = editingProject ? safeImagePath(editingProject.image) : '';
    var source = previewSource(image);
    cancelPreviewRead();
    if (!source) {
      clearPreview();
      return;
    }
    logoPreview.hidden = false;
    logoPreviewImage.src = source;
    logoPreviewImage.alt = editingProject.title || 'Current project logo';
    logoPreviewText.textContent = 'Current logo';
  }

  function showSelectedLogo(file) {
    cancelPreviewRead();
    logoPreview.hidden = true;
    logoPreviewImage.removeAttribute('src');
    logoPreviewText.textContent = 'Loading preview…';
    var reader = new FileReader();
    previewReader = reader;
    reader.onload = function () {
      if (previewReader !== reader) return;
      previewReader = null;
      logoPreview.hidden = false;
      logoPreviewImage.src = String(reader.result || '');
      logoPreviewImage.alt = 'Selected logo preview';
      logoPreviewText.textContent =
        (file.name || 'Selected image') + ' · ' + fileSizeLabel(file.size);
    };
    reader.onerror = function () {
      if (previewReader !== reader) return;
      previewReader = null;
      logoPreview.hidden = true;
      logoPreviewImage.removeAttribute('src');
      logoPreviewText.textContent = 'A preview is unavailable for this file.';
    };
    reader.readAsDataURL(file);
  }

  function updateLogoPreview() {
    var file = logoInput && logoInput.files ? logoInput.files[0] : null;
    if (file) showSelectedLogo(file);
    else showExistingLogo();
  }

  function parseTags(value) {
    return String(value || '')
      .split(/[,\n;]+/)
      .map(function (tag) {
        return tag.trim();
      })
      .filter(Boolean);
  }

  function validHttpUrl(value) {
    if (!value) return true;
    try {
      var url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function focusField(name) {
    var field = form.elements[name];
    if (field && typeof field.focus === 'function') field.focus();
  }

  function readDraft() {
    var data = new FormData(form);
    return {
      id: String(data.get('id') || ''),
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim(),
      techUsage: String(data.get('techUsage') || ''),
      live: String(data.get('live') || '').trim(),
      github: String(data.get('github') || '').trim(),
      logo: logoInput && logoInput.files ? logoInput.files[0] || null : null,
    };
  }

  function validateDraft(draft) {
    var tags = parseTags(draft.techUsage);
    if (!draft.title)
      return { field: 'title', message: 'Enter a project title.' };
    if (draft.title.length > 180)
      return {
        field: 'title',
        message: 'The project title must be 180 characters or fewer.',
      };
    if (!draft.description)
      return { field: 'description', message: 'Enter a project description.' };
    if (draft.description.length > 5000)
      return {
        field: 'description',
        message: 'The description must be 5000 characters or fewer.',
      };
    if (tags.length > 30)
      return {
        field: 'techUsage',
        message: 'List no more than 30 technologies.',
      };
    for (var i = 0; i < tags.length; i++)
      if (tags[i].length > 50)
        return {
          field: 'techUsage',
          message: 'Each technology must be 50 characters or fewer.',
        };
    if (!validHttpUrl(draft.live))
      return {
        field: 'live',
        message: 'Enter a valid http or https live link.',
      };
    if (!validHttpUrl(draft.github))
      return {
        field: 'github',
        message: 'Enter a valid http or https GitHub link.',
      };
    if (draft.logo) {
      var type = logoType(draft.logo);
      if (!type)
        return {
          field: 'logo',
          message: 'Choose a PNG, JPG, WebP, or GIF image.',
        };
      if (!draft.logo.size)
        return { field: 'logo', message: 'The selected image is empty.' };
      if (draft.logo.size > MAX_LOGO_BYTES)
        return {
          field: 'logo',
          message: 'The logo must be 2 MB or smaller.',
        };
    }
    var existingImage = editingProject
      ? safeImagePath(editingProject.image)
      : '';
    if (!draft.logo && !pendingLogoPath && !existingImage)
      return {
        field: 'logo',
        message: 'Choose a logo image for the new project.',
      };
    return { tags: tags };
  }

  function buildProject(draft, tags, uploadedPath) {
    var existing = editingProject;
    var previousImage = existing ? safeImagePath(existing.image) : '';
    var image = uploadedPath || pendingLogoPath || previousImage;
    if (!existing) {
      var host = '';
      try {
        if (draft.live) host = new URL(draft.live).host;
        else if (draft.github) host = new URL(draft.github).host;
      } catch (_) {}
      return {
        id: crypto.randomUUID(),
        title: draft.title,
        subtitle: 'Project',
        categories: '',
        tags: tags,
        live: draft.live,
        github: draft.github,
        image: image,
        imageAlt: draft.title,
        url: host || 'Project',
        status: draft.live ? 'Live' : 'Project',
        description: draft.description,
      };
    }
    var project = Object.assign({}, existing, {
      title: draft.title,
      tags: tags,
      live: draft.live,
      github: draft.github,
      image: image,
      description: draft.description,
    });
    if (draft.live !== (existing.live || '')) {
      var displayHost = '';
      try {
        if (draft.live) displayHost = new URL(draft.live).host;
        else if (draft.github) displayHost = new URL(draft.github).host;
      } catch (_) {}
      project.url = displayHost || 'Project';
    }
    if (image && image !== previousImage) project.imageAlt = draft.title;
    return project;
  }

  function uploadLogo(file) {
    var contentType = logoType(file);
    return fetch('/api/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-CSRF-Token': csrfToken,
      },
      body: file,
    }).then(function (response) {
      var csrf = response.headers.get('X-CSRF-Token');
      if (csrf) csrfToken = csrf;
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!response.ok) {
            if (response.status === 401) signedOut();
            var error = Error(
              data && data.error
                ? data.error
                : 'Could not upload the project logo.',
            );
            error.status = response.status;
            throw error;
          }
          if (!data || !safeImagePath(data.path))
            throw new Error('The upload response was invalid.');
          return data.path;
        });
    });
  }

  function resetProjectForm() {
    form.reset();
    editingProject = null;
    pendingLogoPath = '';
    formDirty = false;
    form.elements.id.value = '';
    clearPreview();
    document.getElementById('formTitle').textContent = 'Add a project';
  }

  function indexOfId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  }

  function titleOf(id) {
    var index = indexOfId(id);
    return index < 0 ? 'project' : items[index].title || 'project';
  }

  function isDirty() {
    return formDirty || orderDirty;
  }

  function api(url, options) {
    options = options || {};
    var headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {},
    );
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (options.method === 'PUT') headers['If-Match'] = etag;
    return fetch(url, Object.assign({}, options, { headers: headers })).then(
      function (r) {
        var csrf = r.headers.get('X-CSRF-Token');
        if (csrf) csrfToken = csrf;
        var tag = r.headers.get('ETag');
        if (tag) etag = tag;
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!r.ok) {
              if (r.status === 401) signedOut();
              var error = Error(
                data && data.error ? data.error : 'Request failed',
              );
              error.status = r.status;
              throw error;
            }
            return data;
          });
      },
    );
  }

  function applyServerItems(data) {
    items = cloneList(Array.isArray(data) ? data : []);
    committedItems = cloneList(items);
    orderDirty = false;
    if (editingProject) {
      var index = indexOfId(editingProject.id);
      editingProject = index < 0 ? null : Object.assign({}, items[index]);
      var file = logoInput && logoInput.files ? logoInput.files[0] : null;
      if (!file) updateLogoPreview();
    }
    render();
  }

  function refresh() {
    return api('/api/projects')
      .then(function (data) {
        applyServerItems(data);
        return true;
      })
      .catch(function (error) {
        say(error.message);
        return false;
      });
  }

  function show() {
    document.getElementById('loginPanel').hidden = true;
    document.getElementById('dashboard').hidden = false;
    render();
  }

  function syncOrderDirty() {
    orderDirty = !sameOrder(items, committedItems);
    updateOrderControls();
  }

  function updateOrderControls() {
    if (orderStatus) {
      orderStatus.textContent = orderDirty
        ? 'Unsaved order changes.'
        : 'Order matches saved projects.';
      orderStatus.classList.toggle('is-dirty', orderDirty);
    }
    if (saveOrderButton) {
      saveOrderButton.disabled = saving || !orderDirty;
      saveOrderButton.textContent = saving ? 'Saving order…' : 'Save order';
    }
    if (list) list.setAttribute('aria-busy', saving ? 'true' : 'false');
  }

  function applyRowState() {
    var rows = list.querySelectorAll('.project-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var handle = row.querySelector('.drag-handle');
      var edit = row.querySelector('.edit-project');
      var up = row.querySelector('.move-up');
      var down = row.querySelector('.move-down');
      if (handle) handle.disabled = saving;
      if (edit) edit.disabled = saving;
      if (up) up.disabled = saving || i === 0;
      if (down) down.disabled = saving || i === rows.length - 1;
    }
  }

  function updatePositions() {
    var rows = list.querySelectorAll('.project-row');
    for (var i = 0; i < rows.length; i++) {
      var value = rows[i].querySelector('.position-value');
      if (value) value.textContent = String(i + 1);
    }
  }

  function setSaving(value) {
    saving = value;
    applyRowState();
    updateOrderControls();
    ['newProject', 'logout'].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.disabled = value;
    });
    if (logoInput) logoInput.disabled = value;
    var submit = form.querySelector('button.btn-primary');
    if (submit) submit.disabled = value;
  }

  function focusControl(id, action) {
    var index = indexOfId(id);
    var row = index < 0 ? null : list.querySelectorAll('.project-row')[index];
    if (!row) return;
    var selector =
      action === 'up'
        ? '.move-up'
        : action === 'down'
          ? '.move-down'
          : action === 'handle'
            ? '.drag-handle'
            : '.edit-project';
    var control = row.querySelector(selector);
    if ((!control || control.disabled) && action === 'up')
      control = row.querySelector('.move-down');
    else if ((!control || control.disabled) && action === 'down')
      control = row.querySelector('.move-up');
    if (!control || control.disabled)
      control = row.querySelector('.drag-handle');
    if (control && !control.disabled) control.focus();
  }

  function moveProject(id, delta) {
    if (saving) return;
    var from = indexOfId(id);
    var to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    var moved = items[from];
    items = moveItem(items, from, to);
    syncOrderDirty();
    render({ id: id, action: delta < 0 ? 'up' : 'down' });
    say(
      'Moved ' +
        (moved.title || 'project') +
        ' to position ' +
        (to + 1) +
        '. Choose Save order to keep this order.',
    );
  }

  function confirmDiscardForm() {
    if (!formDirty) return true;
    if (!window.confirm('Discard your unsaved project changes?')) return false;
    formDirty = false;
    return true;
  }

  function confirmKeepOrder() {
    if (!orderDirty) return true;
    return window.confirm(
      'You have unsaved order changes. Continue editing? The new order stays pending and will be saved with the project.',
    );
  }

  function editProject(project) {
    if (saving) return;
    if (!confirmDiscardForm()) return;
    if (!confirmKeepOrder()) return;
    form.reset();
    pendingLogoPath = '';
    editingProject = Object.assign({}, project);
    form.elements.id.value = project.id;
    form.elements.title.value = project.title || '';
    form.elements.description.value = project.description || '';
    form.elements.techUsage.value = Array.isArray(project.tags)
      ? project.tags.join(', ')
      : '';
    form.elements.live.value = project.live || '';
    form.elements.github.value = project.github || '';
    formDirty = false;
    updateLogoPreview();
    document.getElementById('formTitle').textContent = 'Edit project';
    say('Editing ' + (project.title || 'project') + '.');
    form.scrollIntoView({ behavior: 'smooth' });
  }

  function rowAtPoint(clientY) {
    var rows = list.querySelectorAll('.project-row');
    if (!rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2)
        return { row: rows[i], id: rowIds.get(rows[i]), after: false };
    }
    var last = rows[rows.length - 1];
    return { row: last, id: rowIds.get(last), after: true };
  }

  function clearDropTargets() {
    var marked = list.querySelectorAll('.drop-before,.drop-after');
    for (var i = 0; i < marked.length; i++)
      marked[i].classList.remove('drop-before', 'drop-after');
  }

  function clearDragVisuals() {
    clearDropTargets();
    var dragged = list.querySelector('.is-dragging');
    if (dragged) dragged.classList.remove('is-dragging');
    list.classList.remove('is-dragging');
    document.body.classList.remove('dragging-project');
  }

  function startDrag(event, row, id) {
    if (saving || items.length < 2) {
      event.preventDefault();
      return;
    }
    draggedId = id;
    dragStartItems = items.slice();
    dropHandled = false;
    row.classList.add('is-dragging');
    list.classList.add('is-dragging');
    document.body.classList.add('dragging-project');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', id);
      } catch (_) {}
      try {
        event.dataTransfer.setDragImage(row, 24, 24);
      } catch (_) {}
    }
    say(
      'Dragging ' +
        titleOf(id) +
        '. Drop it in the new position, or use Move up and Move down.',
    );
  }

  function handleDragOver(event) {
    if (!draggedId || saving) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    var target = rowAtPoint(event.clientY);
    if (!target || !target.id) return;
    if (target.id === draggedId) {
      clearDropTargets();
      return;
    }
    var next = reorderById(items, draggedId, target.id, target.after);
    if (!sameOrder(next, items)) {
      items = next;
      var draggedRow = list.querySelector('.is-dragging');
      if (draggedRow) {
        if (target.after)
          list.insertBefore(draggedRow, target.row.nextElementSibling);
        else list.insertBefore(draggedRow, target.row);
      }
      updatePositions();
      applyRowState();
      syncOrderDirty();
    }
    clearDropTargets();
    if (target.row && target.row.parentNode === list)
      target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
  }

  function endDrag(restore) {
    var snapshot = dragStartItems;
    clearDragVisuals();
    draggedId = '';
    dragStartItems = null;
    dropHandled = false;
    if (restore && snapshot) {
      items = snapshot;
      syncOrderDirty();
      render();
      say('Reorder canceled. The previous order is still shown.');
      return;
    }
    syncOrderDirty();
  }

  function handleDrop(event) {
    if (!draggedId) return;
    event.preventDefault();
    dropHandled = true;
    var movedId = draggedId;
    var index = indexOfId(movedId);
    var title = titleOf(movedId);
    endDrag(false);
    if (index >= 0) {
      focusControl(movedId, 'handle');
      say(
        'Moved ' +
          title +
          ' to position ' +
          (index + 1) +
          '. Choose Save order to keep this order.',
      );
    }
  }

  function render(focus) {
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'project-empty';
      empty.textContent =
        'No projects yet. Add a project below to get started.';
      list.appendChild(empty);
      applyRowState();
      updateOrderControls();
      return;
    }
    items.forEach(function (project, index) {
      var row = document.createElement('div'),
        handle = document.createElement('button'),
        glyph = document.createElement('span'),
        position = document.createElement('span'),
        positionLabel = document.createElement('span'),
        positionValue = document.createElement('span'),
        title = document.createElement('strong'),
        actions = document.createElement('div'),
        edit = document.createElement('button'),
        up = document.createElement('button'),
        down = document.createElement('button');
      row.className = 'project-row';
      row.setAttribute('role', 'listitem');
      rowIds.set(row, project.id);

      handle.type = 'button';
      handle.className = 'drag-handle';
      handle.draggable = true;
      handle.setAttribute(
        'aria-label',
        'Drag to reorder ' + (project.title || 'project'),
      );
      handle.title = 'Drag to reorder ' + (project.title || 'project');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = '⠿';
      handle.appendChild(glyph);
      handle.addEventListener('dragstart', function (event) {
        startDrag(event, row, project.id);
      });
      handle.addEventListener('dragend', function () {
        if (draggedId) endDrag(!dropHandled);
      });

      position.className = 'project-position';
      positionLabel.className = 'sr-only';
      positionLabel.textContent = 'Position ';
      positionValue.className = 'position-value';
      positionValue.textContent = String(index + 1);
      position.append(positionLabel, positionValue);

      title.className = 'project-title';
      title.textContent = project.title;

      actions.className = 'project-row-actions';
      edit.type = 'button';
      edit.className = 'btn edit-project';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + (project.title || 'project'));
      edit.addEventListener('click', function () {
        editProject(project);
      });

      up.type = 'button';
      up.className = 'btn move-up';
      up.textContent = 'Move up';
      up.setAttribute(
        'aria-label',
        'Move ' + (project.title || 'project') + ' up',
      );
      up.addEventListener('click', function () {
        moveProject(project.id, -1);
      });

      down.type = 'button';
      down.className = 'btn move-down';
      down.textContent = 'Move down';
      down.setAttribute(
        'aria-label',
        'Move ' + (project.title || 'project') + ' down',
      );
      down.addEventListener('click', function () {
        moveProject(project.id, 1);
      });

      actions.append(edit, up, down);
      row.append(handle, position, title, actions);
      list.appendChild(row);
    });
    applyRowState();
    updatePositions();
    updateOrderControls();
    if (focus) focusControl(focus.id, focus.action);
  }

  if (list) {
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('drop', handleDrop);
  }

  api('/api/projects')
    .then(function (data) {
      applyServerItems(data);
      show();
    })
    .catch(function () {});

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(e.currentTarget);
    api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: data.get('email'),
        password: data.get('password'),
      }),
    })
      .then(function (result) {
        csrfToken = result.csrfToken;
        show();
        refresh();
      })
      .catch(function (err) {
        say(err.message);
      });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (saving) return;
    var draft = readDraft();
    var checked = validateDraft(draft);
    if (!checked.tags) {
      say(checked.message, 'error');
      focusField(checked.field);
      return;
    }
    var id = draft.id;
    var index = id
      ? items.findIndex(function (item) {
          return item.id === id;
        })
      : -1;
    if (id && index < 0) {
      say('Project could not be found; refresh and try again.', 'error');
      return;
    }
    setSaving(true);
    var alreadyUploaded = Boolean(pendingLogoPath);
    say(draft.logo && !alreadyUploaded ? 'Uploading logo…' : 'Saving project…');
    var uploadStep = alreadyUploaded
      ? Promise.resolve(pendingLogoPath)
      : draft.logo
        ? uploadLogo(draft.logo)
        : Promise.resolve('');
    uploadStep
      .then(function (uploadedPath) {
        if (uploadedPath) pendingLogoPath = uploadedPath;
        var project = buildProject(draft, checked.tags, uploadedPath);
        if (index >= 0) items[index] = project;
        else items.push(project);
        say('Saving project…');
        return api('/api/projects', {
          method: 'PUT',
          body: JSON.stringify(items),
        }).then(function () {
          return project;
        });
      })
      .then(function (project) {
        committedItems = cloneList(items);
        orderDirty = false;
        formDirty = false;
        resetProjectForm();
        setSaving(false);
        render();
        say('Project saved. It now appears on your portfolio.', 'success');
        return project;
      })
      .catch(function (err) {
        setSaving(false);
        formDirty = true;
        if (err.status === 409) {
          refresh().then(function (loaded) {
            say(
              loaded
                ? 'Projects changed in another session. The latest projects have been loaded; review them and save again.'
                : 'Projects changed in another session. Refresh the page and review the latest projects before saving again.',
              'error',
            );
          });
          return;
        }
        say(err.message, 'error');
      });
  });

  if (logoInput) {
    logoInput.addEventListener('change', function () {
      formDirty = true;
      var file = logoInput.files ? logoInput.files[0] : null;
      if (!file) {
        pendingLogoPath = '';
        updateLogoPreview();
        say(
          editingProject
            ? 'New logo cleared. The current logo will be kept.'
            : 'Choose a logo image for the new project.',
          editingProject ? undefined : 'error',
        );
        return;
      }
      var type = logoType(file);
      if (!type) {
        logoInput.value = '';
        pendingLogoPath = '';
        updateLogoPreview();
        say('Choose a PNG, JPG, WebP, or GIF image.', 'error');
        return;
      }
      if (!file.size) {
        logoInput.value = '';
        pendingLogoPath = '';
        updateLogoPreview();
        say('The selected image is empty.', 'error');
        return;
      }
      if (file.size > MAX_LOGO_BYTES) {
        logoInput.value = '';
        pendingLogoPath = '';
        updateLogoPreview();
        say('The logo must be 2 MB or smaller.', 'error');
        return;
      }
      pendingLogoPath = '';
      updateLogoPreview();
      say('New logo selected. Choose Save project to upload it.');
    });
  }

  form.addEventListener('input', function (event) {
    if (event.target === logoInput) return;
    formDirty = true;
    say('Unsaved changes. Save the project or discard before leaving.');
  });

  if (saveOrderButton) {
    saveOrderButton.addEventListener('click', function () {
      if (saving || !orderDirty) return;
      setSaving(true);
      say('Saving project order…');
      api('/api/projects', { method: 'PUT', body: JSON.stringify(items) })
        .then(function () {
          committedItems = cloneList(items);
          orderDirty = false;
          setSaving(false);
          render({ id: items[0] ? items[0].id : '', action: 'handle' });
          say('Project order saved.');
        })
        .catch(function (err) {
          if (err.status === 409) {
            refresh().then(function (loaded) {
              setSaving(false);
              say(
                loaded
                  ? 'Projects changed in another session. The latest order has been loaded; review it before saving again.'
                  : 'Projects changed in another session. Reload the page and review the latest order before saving again.',
              );
            });
            return;
          }
          setSaving(false);
          say(
            err.status === 400
              ? 'The order could not be saved because the project list is invalid. Review the projects and try again.'
              : 'Could not save the project order. Your unsaved order is still shown; try again.',
          );
        });
    });
  }

  window.addEventListener('beforeunload', function (event) {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.getElementById('newProject').addEventListener('click', function () {
    if (saving) return;
    if (!confirmDiscardForm()) return;
    if (!confirmKeepOrder()) return;
    resetProjectForm();
    say('Ready to add a new project.');
  });

  document.getElementById('logout').addEventListener('click', function () {
    if (saving) return;
    if (isDirty() && !window.confirm('Sign out and discard unsaved changes?'))
      return;
    api('/api/logout', { method: 'POST' })
      .then(function () {
        location.reload();
      })
      .catch(function (err) {
        say(err.message);
      });
  });
})();
