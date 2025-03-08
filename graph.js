// GraphNav version 1.1 - Added support for calvinswalker.com and debugging
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

        this.init();
    }

    init() {
        // Find the main element to position the graph at the end
        const main = document.querySelector('main');
        if (!main) return;
        
        // Determine current page
        const currentPath = window.location.pathname;
        
        // Debug info for path resolution (will be visible in browser console)
        console.log('Current path:', currentPath);
        console.log('Host:', window.location.hostname);
        
        let currentPageId = this.getCurrentPageId(currentPath);
        console.log('Resolved page ID:', currentPageId);
        
        // Create graph container
        const graphNav = document.createElement('div');
        graphNav.className = 'graph-nav';
        graphNav.style.width = '100%';
        graphNav.style.height = '120px';
        graphNav.style.marginTop = '40px';
        graphNav.style.display = 'flex';
        graphNav.style.justifyContent = 'center';
        
        const container = document.createElement('div');
        container.className = 'graph-container';
        container.style.position = 'relative';
        container.style.height = '100%';
        container.style.width = '400px';
        
        // Create all edges
        this.edges.forEach(edge => {
            const fromNode = this.nodes.find(n => n.id === edge.from);
            const toNode = this.nodes.find(n => n.id === edge.to);
            
            if (!fromNode || !toNode) return;
            
            const edgeEl = document.createElement('div');
            edgeEl.className = 'graph-edge';
            
            // Highlight edges connected to current page
            if (currentPageId && (edge.from === currentPageId || edge.to === currentPageId)) {
                edgeEl.classList.add('active');
                console.log('Highlighting edge:', edge.from, 'to', edge.to, 'for page:', currentPageId);
            } else {
                console.log('Not highlighting edge:', edge.from, 'to', edge.to, 'for page:', currentPageId);
            }
            
            // Calculate edge position and rotation
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            // Adjust positioning to center with nodes
            edgeEl.style.width = `${length}px`;
            edgeEl.style.left = `${fromNode.x + 4}px`;
            edgeEl.style.top = `${fromNode.y + 4}px`;
            edgeEl.style.transform = `rotate(${angle}deg)`;
            
            container.appendChild(edgeEl);
        });

        // Create all nodes
        this.nodes.forEach((node, index) => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'graph-node';
            nodeEl.setAttribute('data-label', node.label);
            
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;
            
            // Add staggered animation delay
            nodeEl.style.animationDelay = `${index * 0.1}s`;
            
            // Adjust URL based on current page location
            let url = node.url;
            if (window.location.pathname.includes('/writing/')) {
                // If we're in a subdirectory, go up one level
                url = '../' + node.url.replace('./', '');
            }
            
            // Highlight current page
            if (node.id === currentPageId) {
                nodeEl.classList.add('active');
            }
            
            nodeEl.addEventListener('click', () => {
                if (node.id !== currentPageId) {
                    window.location.href = url;
                }
            });
            
            container.appendChild(nodeEl);
        });

        graphNav.appendChild(container);
        
        // Append the graph at the end of the main content
        main.appendChild(graphNav);
    }
    
    getCurrentPageId(path) {
        // Handle GitHub Pages paths which might include the repository name
        // or have different formats in production vs local
        const normalizedPath = path.toLowerCase();
        const hostname = window.location.hostname;
        
        console.log('Normalized path:', normalizedPath);
        
        // Home page detection
        if (normalizedPath === '/' || 
            normalizedPath.endsWith('/index.html') || 
            normalizedPath.endsWith('/') ||
            normalizedPath === '/cwalkers.github.io/' ||
            normalizedPath === '/cwalkers.github.io/index.html') {
            return 'home';
        } 
        // Writing page detection
        else if (normalizedPath.includes('writing.html')) {
            return 'writing';
        } 
        // Photos page detection
        else if (normalizedPath.includes('photos.html')) {
            return 'photos';
        }
        
        // If we couldn't determine the page from the path, try using the hostname
        if (hostname === 'calvinswalker.com' || hostname === 'www.calvinswalker.com') {
            // For custom domain, try to determine page from the last segment of the path
            const segments = normalizedPath.split('/').filter(segment => segment.length > 0);
            const lastSegment = segments[segments.length - 1] || '';
            
            console.log('Path segments:', segments);
            console.log('Last segment:', lastSegment);
            
            if (lastSegment === '' || lastSegment === 'index.html') {
                return 'home';
            } else if (lastSegment === 'writing.html') {
                return 'writing';
            } else if (lastSegment === 'photos.html') {
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
