// GraphNav version 2.7 - Year nodes highlight the way back to Images instead of themselves
//
// Photos are grouped into year nodes, listed by file name (without extension), newest year first.
// (The code calls these groups "places"; they can be anything.) Add new photos to their year here.
// Photos that aren't listed simply don't get a node; they still show in the grid.
const PHOTO_PLACES = [
    { id: '2026', label: '2026', photos: ['IMG_3748', 'IMG_0704', 'IMG_4700'] },
    { id: '2025', label: '2025', photos: ['IMG_1025', 'IMG_001', 'IMG_1266'] },
    {
        id: '2024',
        label: '2024',
        photos: [
            'IMG_0961', 'IMG_0875', 'IMG_6659', 'IMG_7821', 'IMG_6682', 'IMG_0464',
            'IMG_0468', 'IMG_0431', 'IMG_0424', 'IMG_0360', 'IMG_0126', 'IMG_0146',
        ],
    },
    {
        id: '2023',
        label: '2023',
        photos: [
            'IMG_2396', 'IMG_9868', 'IMG_9791', 'IMG_9680', 'IMG_9575',
            'IMG_1290', 'IMG_1125', 'IMG_8239', 'IMG_8252', 'IMG_8256',
        ],
    },
];

// The organic layout is random but seeded, so it's identical on every page load.
// Change this number to get a different arrangement.
const LAYOUT_SEED = 7;

// Extra frame height above the top of the world (y = 0), so hover labels above the top nodes
// aren't clipped. The frame extends up into the page margin, so nothing shifts on the page.
const HEADROOM = 24;

const FRAME_H_COLLAPSED = 120 + HEADROOM;
const FRAME_H_EXPANDED = 230 + HEADROOM;

function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// Nudge {x, y} points apart (and away from fixed points) until none are closer than minDist
function separatePoints(movers, fixed, minDist, iterations, constrain) {
    for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < movers.length; i++) {
            for (let j = i + 1; j < movers.length; j++) {
                const a = movers[i];
                const b = movers[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d = Math.hypot(dx, dy) || 0.01;
                if (d < minDist) {
                    const push = (minDist - d) / 2 / d;
                    a.x -= dx * push;
                    a.y -= dy * push;
                    b.x += dx * push;
                    b.y += dy * push;
                }
            }
            fixed.forEach(f => {
                const dx = movers[i].x - f.x;
                const dy = movers[i].y - f.y;
                const d = Math.hypot(dx, dy) || 0.01;
                if (d < minDist) {
                    movers[i].x += dx / d * (minDist - d);
                    movers[i].y += dy / d * (minDist - d);
                }
            });
        }
        if (constrain) movers.forEach(constrain);
    }
}

class GraphNav {
    constructor() {
        this.nodes = [
            { id: 'home', label: 'Home', url: './index.html', x: 100, y: 60 },
            { id: 'writing', label: 'Writing', url: './writing.html', x: 180, y: 30 },
            { id: 'photos', label: 'Images', url: './photos.html', x: 200, y: 90 },
        ];

        this.edges = [
            { from: 'home', to: 'writing' },
            { from: 'home', to: 'photos' },
            { from: 'photos', to: 'home' },
            { from: 'writing', to: 'home' },
        ];

        // Article pages branch out from their parent node. Add new articles here.
        this.articles = [
            {
                id: 'catacomb',
                label: 'A Catacomb of Concepts',
                date: '1/26/25', // shown on hover (the title is too long for the graph)
                url: './writing/catacomb-of-concepts.html',
                slug: 'catacomb-of-concepts',
                parent: 'writing',
                x: 265,
                y: 55,
            },
        ];

        this.articles.forEach(article => {
            this.nodes.push({ ...article, child: true });
            this.edges.push({ from: article.parent, to: article.id, child: true });
        });

        // Every node has a world-space center (cx, cy) and a size in px
        this.nodes.forEach(node => {
            node.cx = node.x + 4;
            node.cy = node.y + 4;
            node.size = 8;
        });

        this.nodeEls = new Map();
        this.edgeEls = [];

        // Place/photo graph state
        this.isPhotos = false;
        this.placeNodes = [];
        this.expanded = false;  // year nodes visible and frame grown (opens on hovering Images)
        this.hoverId = null;    // place focused by mouse hover, or by the first tap on touch
        this.filterId = null;   // place focused by click/tap on the Images page; also filters the grid
        this.hideTimer = null;
        this.switchTimer = null;     // hover dwell before switching focus
        this.lastFocusChange = 0;    // when focus last changed (ms), to ignore hovers while the camera settles
        this.prevFocusId = null;
        this.lastPointerType = 'mouse';

        // Pages inside /writing/ need to go up a level to reach the site root
        this.root = window.location.pathname.includes('/writing/') ? '../' : './';

        // The frame is the visible (clipped) area of the graph; its height eases between
        // collapsed and expanded. The camera looks at world coordinates through it.
        this.container = null;
        this.frameW = 400;
        this.frameH = FRAME_H_COLLAPSED;
        this.frameHTarget = FRAME_H_COLLAPSED;
        this.cam = { x: 200, y: FRAME_H_COLLAPSED / 2 - HEADROOM, s: 1 };
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.init();
    }

    init() {
        // Find the main element to position the graph at the end
        const main = document.querySelector('main');
        if (!main) return;

        const currentPageId = this.getCurrentPageId(window.location.pathname);

        // The year nodes start tucked away on every page (including Images) and open when the
        // Images node is hovered
        this.isPhotos = currentPageId === 'photos';
        this.expanded = false;
        this.frameH = this.frameHTarget = FRAME_H_COLLAPSED;
        this.cam = { x: 200, y: this.frameH / 2 - HEADROOM, s: 1 };
        this.addPhotoNodes();
        this.nodeById = new Map(this.nodes.map(n => [n.id, n]));

        // Create graph container. Its layout height stays at 120px on the other pages, so when
        // the frame grows it draws over the empty space below instead of pushing the page around.
        const graphNav = document.createElement('div');
        graphNav.className = 'graph-nav';
        graphNav.style.width = '100%';
        graphNav.style.height = `${FRAME_H_COLLAPSED - HEADROOM}px`;
        graphNav.style.marginTop = '40px';
        graphNav.style.display = 'flex';
        graphNav.style.justifyContent = 'center';

        const container = document.createElement('div');
        container.className = 'graph-container';
        container.style.position = 'relative';
        container.style.height = `${this.frameH}px`;
        container.style.marginTop = `-${HEADROOM}px`;
        container.style.width = `${this.frameW}px`;
        // The camera can move nodes out of view; keep them bounded to the frame
        container.style.overflow = 'hidden';
        this.container = container;

        // Create all edges
        this.edges.forEach(edge => {
            const edgeEl = document.createElement('div');
            edgeEl.className = 'graph-edge';
            if (edge.child) edgeEl.classList.add('child');
            if (edge.photo) edgeEl.classList.add('photo');
            if (edge.place) {
                edgeEl.classList.add('place');
                edgeEl.classList.toggle('collapsed', !this.expanded);
            }

            container.appendChild(edgeEl);
            this.edgeEls.push({ el: edgeEl, edge });
        });

        // Create all nodes
        this.nodes.forEach((node, index) => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'graph-node';
            nodeEl.setAttribute('data-label', node.date || node.label || '');
            if (node.child) nodeEl.classList.add('child');
            if (node.kind) nodeEl.classList.add(node.kind);
            if (node.kind === 'place') nodeEl.classList.toggle('collapsed', !this.expanded);

            // Each node drifts on its own slow, offset cycle
            node.phase = index * 1.7;

            // Adjust URL based on current page location
            let url = node.url;
            if (url && window.location.pathname.includes('/writing/')) {
                // If we're in a subdirectory, go up one level
                url = '../' + node.url.replace('./', '');
            }

            nodeEl.addEventListener('click', () => this.onNodeClick(node, currentPageId, url));

            container.appendChild(nodeEl);
            this.nodeEls.set(node.id, nodeEl);
        });

        graphNav.appendChild(container);

        // Append the graph at the end of the main content
        main.appendChild(graphNav);

        this.showArticles();
        this.setupPlaceInteractions(container);
        this.setupMotion();
        if (this.isPhotos) this.applyUrlState();
    }

    // Build a node for each group of photos, scattered around the Images node, plus a
    // (hidden until focused) node for every photo in the group.
    addPhotoNodes() {
        // On the Images page only photos that are actually in the grid get nodes
        const items = new Map(); // file base name -> .photo-item element
        if (this.isPhotos) {
            document.querySelectorAll('.photo-item').forEach(el => {
                items.set(this.baseName(el), el);
            });
        }

        const hub = this.nodes.find(n => n.id === 'photos');
        const places = PHOTO_PLACES
            .map(place => ({
                ...place,
                photos: this.isPhotos ? place.photos.filter(base => items.has(base)) : place.photos,
            }))
            .filter(place => place.photos.length > 0);

        const rand = seededRandom(LAYOUT_SEED);

        // Scatter places on a loose arc below the Images node (random angle and distance),
        // then relax them so none overlap each other or the existing nodes.
        const points = places.map((place, i) => {
            const t = (i + 0.5) / places.length;
            const angle = (10 + t * 160 + (rand() - 0.5) * 24) * Math.PI / 180;
            const radius = 50 + rand() * 45;
            return {
                x: hub.cx + radius * Math.cos(angle),
                y: hub.cy + radius * Math.sin(angle),
            };
        });
        const fixed = this.nodes.map(n => ({ x: n.cx, y: n.cy }));
        separatePoints(points, fixed, 46, 80, p => {
            p.x = clamp(p.x, 60, 345);
            p.y = clamp(p.y, 118, 196);
        });

        places.forEach((place, i) => {
            const placeNode = {
                id: `place-${place.id}`,
                label: place.label,
                kind: 'place',
                place,
                cx: points[i].x,
                cy: points[i].y,
                size: 8,
                reveal: 0, // 0 = photos tucked into the place node, 1 = fully fanned out
                photoNodes: [],
            };
            this.nodes.push(placeNode);
            this.placeNodes.push(placeNode);
            this.edges.push({ from: 'photos', to: placeNode.id, place: true });

            // Photos sit on the side facing away from the Images node, with a random angle
            // and distance each, then get relaxed apart so the thumbnails don't overlap.
            const away = Math.atan2(placeNode.cy - hub.cy, placeNode.cx - hub.cx);
            const n = place.photos.length;
            const step = Math.min(70, 300 / n) * Math.PI / 180;
            const offsets = place.photos.map((base, j) => {
                const a = away + (j - (n - 1) / 2) * step + (rand() - 0.5) * 0.5;
                // Bigger groups fan out wider so the thumbnails have room
                const r = Math.max(32, 14 + n * 4) + rand() * 22;
                return { x: r * Math.cos(a), y: r * Math.sin(a) };
            });
            separatePoints(offsets, [{ x: 0, y: 0 }], 26, 40);

            place.photos.forEach((base, j) => {
                const photoNode = {
                    id: `photo-${base}`,
                    kind: 'photo',
                    base,
                    item: items.get(base) || null,
                    placeNode,
                    dx: offsets[j].x,
                    dy: offsets[j].y,
                    cx: placeNode.cx,
                    cy: placeNode.cy,
                    size: 20,
                };
                this.nodes.push(photoNode);
                placeNode.photoNodes.push(photoNode);
                this.edges.push({ from: placeNode.id, to: photoNode.id, photo: true });
            });
        });
    }

    // File name without folder or extension, e.g. "images/IMG_3748.jpg" -> "IMG_3748"
    baseName(photoItemEl) {
        return (photoItemEl.dataset.full || '').split('/').pop().replace(/\.[^.]+$/, '');
    }

    photosUrl(params) {
        return `${this.root}photos.html?${new URLSearchParams(params)}`;
    }

    onNodeClick(node, currentPageId, url) {
        const touch = this.lastPointerType !== 'mouse';

        if (node.kind === 'place') {
            if (this.isPhotos) {
                this.toggleFilter(node);
            } else if (touch && this.focusId() !== node.id) {
                // First tap previews the place; a second tap goes there
                this.hoverId = node.id;
                this.updateFocus();
            } else {
                window.location.href = this.photosUrl({ place: node.place.id });
            }
        } else if (node.kind === 'photo') {
            if (node.item) {
                // Reuse the Images page's existing modal by clicking the matching grid item
                node.item.click();
            } else {
                window.location.href = this.photosUrl({ place: node.placeNode.place.id, photo: node.base });
            }
        } else if (node.id === 'photos' && touch && !this.expanded) {
            // First tap opens the year nodes; a second tap goes to the Images page (or, if
            // already there, resets the view)
            this.setExpanded(true);
        } else if (node.id === currentPageId) {
            // Clicking the Images node while on the Images page resets the view
            if (this.isPhotos) this.reset();
        } else {
            window.location.href = url;
        }
    }

    // Arriving from another page: ?place=<id> filters to that place, &photo=<file> opens that photo
    applyUrlState() {
        const params = new URLSearchParams(window.location.search);

        const placeNode = this.placeNodes.find(p => p.place.id === params.get('place'));
        if (placeNode) {
            this.setExpanded(true);
            this.toggleFilter(placeNode);
        }

        const photo = params.get('photo');
        if (photo) {
            // Wait for load: the page's modal handlers are attached after this script runs
            window.addEventListener('load', () => {
                const node = this.nodes.find(n => n.kind === 'photo' && n.base === photo);
                if (node && node.item) node.item.click();
            });
        }
    }

    // Article nodes are shown on every page. When another node takes focus they fade back
    // (like everything else outside its cluster) instead of disappearing.
    showArticles() {
        this.nodes.filter(n => n.child).forEach(n => this.nodeEls.get(n.id).classList.add('revealed'));
        this.edgeEls.filter(e => e.edge.child).forEach(e => e.el.classList.add('revealed'));
    }

    // Mouse: hovering any node centers the camera on it and frames its neighbors, so you can walk
    // the graph by hovering. Hovering the Images node also opens the year nodes (on pages other
    // than Images). The focus is held until the cursor leaves the graph, so the camera moving a
    // node out from under the cursor doesn't make the view bounce back and forth.
    // Touch: first tap opens/previews, second tap goes there (see onNodeClick).
    setupPlaceInteractions(container) {
        // Remember the input type so click handlers can tell touch from mouse
        container.addEventListener('pointerdown', e => {
            this.lastPointerType = e.pointerType;
        }, true);

        // A short dwell, plus ignoring hovers while the camera is still settling, stops nodes
        // sliding under a resting cursor from chaining one focus change into the next.
        this.nodes.forEach(node => {
            if (node.kind === 'photo') return;

            const el = this.nodeEls.get(node.id);

            el.addEventListener('pointerenter', e => {
                if (e.pointerType !== 'mouse') return;
                clearTimeout(this.hideTimer);

                // Hovering the Images node opens the year nodes
                if (node.id === 'photos') this.setExpanded(true);

                if (node.id === this.hoverId) return;

                clearTimeout(this.switchTimer);
                this.switchTimer = setTimeout(() => {
                    if (performance.now() - this.lastFocusChange < 500) return;
                    this.hoverId = node.id;
                    this.updateFocus();
                }, this.hoverId ? 150 : 0);
            });

            el.addEventListener('pointerleave', () => clearTimeout(this.switchTimer));
        });

        container.addEventListener('pointerenter', e => {
            if (e.pointerType === 'mouse') clearTimeout(this.hideTimer);
        });

        container.addEventListener('pointerleave', e => {
            if (e.pointerType !== 'mouse') return;
            this.hideTimer = setTimeout(() => {
                this.hoverId = null;
                // Keep the years open while one is selected (its photos are filtering the grid)
                if (this.filterId) {
                    this.updateFocus();
                } else {
                    this.setExpanded(false);
                }
            }, 300);
        });

        // Tapping empty space in the graph zooms back out (and clears the filter)
        container.addEventListener('click', e => {
            if (e.target === container) this.reset();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.reset();
        });
    }

    // Hover wins so you can always move around; with nothing hovered the camera settles back on
    // the click-selected year (if any)
    focusId() {
        return this.hoverId || this.filterId;
    }

    toggleFilter(placeNode) {
        this.filterId = this.filterId === placeNode.id ? null : placeNode.id;
        this.hoverId = null;
        this.applyFilter();
        this.updateFocus();
    }

    clearFocus() {
        this.filterId = null;
        this.hoverId = null;
        this.applyFilter();
        this.updateFocus();
    }

    // Zoom out, clear any selected year and close the year nodes again
    reset() {
        this.clearFocus();
        this.setExpanded(false);
    }

    // Show or hide the place nodes and grow or shrink the frame to fit them
    setExpanded(on) {
        if (this.expanded === on) return;
        this.expanded = on;
        this.frameHTarget = on ? FRAME_H_EXPANDED : FRAME_H_COLLAPSED;

        this.placeNodes.forEach(node => {
            this.nodeEls.get(node.id).classList.toggle('collapsed', !on);
        });
        this.edgeEls.filter(e => e.edge.place).forEach(e => {
            e.el.classList.toggle('collapsed', !on);
        });

        if (!on) this.hoverId = null;
        this.updateFocus();
    }

    // Hide grid photos that aren't in the selected place
    applyFilter() {
        if (!this.isPhotos) return;

        const placeNode = this.placeNodes.find(p => p.id === this.filterId);
        const allowed = placeNode ? new Set(placeNode.place.photos) : null;

        document.querySelectorAll('.photo-item').forEach(el => {
            el.style.display = allowed && !allowed.has(this.baseName(el)) ? 'none' : '';
        });
    }

    // The node the camera is centered on: a click-selected year, else the hovered node
    focusedNode() {
        return this.nodeById.get(this.focusId()) || null;
    }

    // The focused node plus what's visible around it: its neighbors along the edges, and for a
    // year also its photos and Home (so the way back is always in view). Year nodes only count
    // while they're out, and photo nodes only for the year being focused.
    clusterFor(node) {
        const ids = new Set([node.id]);

        this.edges.forEach(edge => {
            if (edge.from === node.id) ids.add(edge.to);
            if (edge.to === node.id && !edge.photo) ids.add(edge.from);
        });
        if (node.kind === 'place') ids.add('home');

        return [...ids]
            .map(id => this.nodeById.get(id))
            .filter(n => n && (n.kind !== 'place' || this.expanded));
    }

    // Where a node sits when fully spread out (photos fanned out around their year)
    restingPosition(node) {
        return node.kind === 'photo'
            ? { x: node.placeNode.cx + node.dx, y: node.placeNode.cy + node.dy }
            : { x: node.cx, y: node.cy };
    }

    // Camera that leans toward the node rather than fully centering on it: partway between the
    // overview and a camera centered on the node (CENTERING), then panned just enough that the
    // whole cluster stays inside the frame, clear of the faded edges.
    cameraFor(node) {
        const CENTERING = 0.5; // 0 = stay on the overview, 1 = center on the node and zoom right in
        const PAD_X = 60;      // the frame's left/right edges fade out over roughly this distance
        const PAD_Y = 24;

        const W = this.frameW;
        const H = this.frameHTarget;
        const overview = { x: 200, y: H / 2 - HEADROOM };

        const points = this.clusterFor(node).map(n => this.restingPosition(n));
        let reachX = 1;
        let reachY = 1;
        points.forEach(p => {
            reachX = Math.max(reachX, Math.abs(p.x - node.cx));
            reachY = Math.max(reachY, Math.abs(p.y - node.cy));
        });

        // Zoom that would just fit the cluster when centered on the node, eased toward 1
        const fit = clamp(Math.min((W / 2 - PAD_X) / reachX, (H / 2 - PAD_Y) / reachY), 0.75, 1.6);
        const s = 1 + (fit - 1) * CENTERING;

        let x = overview.x + (node.cx - overview.x) * CENTERING;
        let y = overview.y + (node.cy - overview.y) * CENTERING;

        // Keep every cluster member in view
        const viewW = (W / 2 - PAD_X) / s;
        const viewH = (H / 2 - PAD_Y) / s;
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        x = clamp(x, Math.max(...xs) - viewW, Math.min(...xs) + viewW);
        y = clamp(y, Math.max(...ys) - viewH, Math.min(...ys) + viewH);

        return { x, y, s };
    }

    // Apply the current focus: reveal a focused year's photos and dim everything outside the
    // focused node's cluster (the camera follows automatically in render)
    updateFocus() {
        const focused = this.focusedNode();

        const focusKey = focused ? focused.id : null;
        if (focusKey !== this.prevFocusId) {
            this.prevFocusId = focusKey;
            this.lastFocusChange = performance.now();
        }

        const inCluster = new Set(focused ? this.clusterFor(focused).map(n => n.id) : []);
        const highlighted = focused && focused.kind === 'place' ? this.nodeById.get('photos') : focused;

        this.nodes.forEach(node => {
            const el = this.nodeEls.get(node.id);
            if (node.kind === 'photo') {
                const show = !!focused && node.placeNode === focused;
                el.classList.toggle('revealed', show);
                // Load thumbnails lazily, the first time a place is focused
                if (show && !el.style.backgroundImage) {
                    el.style.backgroundImage = `url("${this.root}images/thumbs/${node.base}.jpg")`;
                }
                return;
            }
            el.classList.toggle('dim', !!focused && !inCluster.has(node.id));
            el.classList.toggle('focused', node === focused);
            // The highlight (color and size) follows the focused node, not the current page.
            // Year nodes aren't highlighted themselves; they light up the way back to Images.
            el.classList.toggle('active', node === highlighted);
        });

        this.edgeEls.forEach(({ el, edge }) => {
            const lit = !focused ? false
                : focused.kind === 'place'
                    ? edge.from === 'photos' && edge.to === focused.id
                    : edge.from === focused.id || edge.to === focused.id;
            el.classList.toggle('active', lit);

            if (edge.photo) {
                el.classList.toggle('revealed', !!focused && edge.from === focused.id);
                return;
            }
            el.classList.toggle('dim', !!focused && !(inCluster.has(edge.from) && inCluster.has(edge.to)));
        });

        this.requestRender();
    }

    // Slow sinusoidal drift; edges follow the nodes. Static when reduced motion is preferred.
    setupMotion() {
        const AMPLITUDE = 4;   // px
        const SPEED = 0.0006;  // radians per ms (~9s per cycle)
        const EASE_MS = 240;   // camera/frame/fan easing time constant (higher = gentler)

        // Position everything with the `translate` property (GPU, sub-pixel) rather than
        // left/top, which snap to whole pixels and make the drift look jittery.
        this.nodeEls.forEach(el => {
            el.style.left = '0px';
            el.style.top = '0px';
        });
        this.edgeEls.forEach(({ el }) => {
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.width = '1px'; // stretched to length with scaleX
        });

        let last = 0;

        this.render = time => {
            const dt = time - last;
            last = time;

            // Ease the frame height, camera and each place's photo fan toward their targets
            const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt / EASE_MS);

            this.frameH += (this.frameHTarget - this.frameH) * k;
            if (Math.abs(this.frameHTarget - this.frameH) < 0.1) this.frameH = this.frameHTarget;
            this.container.style.height = `${this.frameH}px`;

            // Overview keeps the top of the frame at world y = 0; a focused place uses its fitted camera
            const focusId = this.focusId();
            const focused = this.focusedNode();
            const target = focused
                ? this.cameraFor(focused)
                : { x: 200, y: this.frameH / 2 - HEADROOM, s: 1 };
            ['x', 'y', 's'].forEach(key => {
                this.cam[key] += (target[key] - this.cam[key]) * k;
            });

            this.placeNodes.forEach(place => {
                place.reveal += ((place.id === focusId ? 1 : 0) - place.reveal) * k;
            });

            const halfW = this.frameW / 2;
            const halfH = this.frameH / 2;
            const pos = new Map();

            this.nodes.forEach(node => {
                let cx = node.cx;
                let cy = node.cy;
                if (node.kind === 'photo') {
                    cx = node.placeNode.cx + node.dx * node.placeNode.reveal;
                    cy = node.placeNode.cy + node.dy * node.placeNode.reveal;
                }

                cx += AMPLITUDE * Math.sin(time * SPEED + node.phase);
                cy += AMPLITUDE * Math.cos(time * SPEED * 0.8 + node.phase * 1.3);

                // World -> screen: nodes keep their size, only positions scale with the camera
                const x = (cx - this.cam.x) * this.cam.s + halfW;
                const y = (cy - this.cam.y) * this.cam.s + halfH;
                pos.set(node.id, { x, y });

                this.nodeEls.get(node.id).style.translate = `${x - node.size / 2}px ${y - node.size / 2}px`;
            });

            this.edgeEls.forEach(({ el, edge }) => {
                const from = pos.get(edge.from);
                const to = pos.get(edge.to);
                if (!from || !to) return;

                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                el.style.translate = `${from.x}px ${from.y}px`;
                el.style.transform = `rotate(${angle}deg) scaleX(${length})`;
            });
        };

        this.render(0);

        if (this.reducedMotion) return;

        const loop = time => {
            this.render(time);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // With reduced motion there is no animation loop, so redraw once when state changes
    requestRender() {
        if (this.reducedMotion && this.render) this.render(0);
    }

    getCurrentPageId(path) {
        // Handle GitHub Pages paths which might include the repository name
        // or have different formats in production vs local
        const normalizedPath = path.toLowerCase();
        const hostname = window.location.hostname;

        // Article page detection (with or without .html extension)
        const article = this.articles.find(a => normalizedPath.includes(a.slug));
        if (article) {
            return article.id;
        }

        // Home page detection
        if (normalizedPath === '/' ||
            normalizedPath.endsWith('/index.html') ||
            normalizedPath.endsWith('/') ||
            normalizedPath === '/cwalkers.github.io/' ||
            normalizedPath === '/cwalkers.github.io/index.html') {
            return 'home';
        }
        // Writing page detection - handle both with and without .html extension
        else if (normalizedPath.includes('writing.html') || normalizedPath === '/writing') {
            return 'writing';
        }
        // Photos page detection - handle both with and without .html extension
        else if (normalizedPath.includes('photos.html') || normalizedPath === '/photos') {
            return 'photos';
        }

        // If we couldn't determine the page from the path, try using the hostname
        if (hostname === 'calvinswalker.com' || hostname === 'www.calvinswalker.com') {
            // For custom domain, try to determine page from the last segment of the path
            const segments = normalizedPath.split('/').filter(segment => segment.length > 0);
            const lastSegment = segments[segments.length - 1] || '';

            if (lastSegment === '' || lastSegment === 'index.html' || lastSegment === 'index') {
                return 'home';
            } else if (lastSegment === 'writing.html' || lastSegment === 'writing') {
                return 'writing';
            } else if (lastSegment === 'photos.html' || lastSegment === 'photos') {
                return 'photos';
            }
        }

        return null;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GraphNav();
});
