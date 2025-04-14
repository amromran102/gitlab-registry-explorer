import * as vscode from 'vscode';
import fetch from 'node-fetch';

// Interfaces for GitLab API responses
interface GitLabProject {
    id: number;
    name: string;
    path_with_namespace: string;
    namespace: {
        full_path: string;
    };
    container_registry_enabled: boolean;
}

interface GitLabRegistryRepo {
    id: number;
    name: string;
    path: string;
}

interface GitLabTag {
    name: string;
    created_at?: string;
    total_size?: number; // Size in bytes
}

// Utility function to format bytes into human-readable units (KB, MB, GB)
function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined || bytes === 0) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Custom TreeItem class
class TreeItemWithContext extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public context: 'folder' | 'project' | 'repo' | 'tag' | 'filter' | 'showAllTags',
        public fullPath?: string,
        public projectId?: number,
        public repoId?: number,
        public tagName?: string,
        public imageUrl?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = context;

        if (context === 'tag' && imageUrl) {
            this.tooltip = `${imageUrl}`;
            this.iconPath = new vscode.ThemeIcon('tag');
        } else if (context === 'filter') {
            this.iconPath = new vscode.ThemeIcon('filter');
            this.command = {
                command: 'gitlabRegistryExplorer.filterTagsInline',
                title: 'Filter Tags',
                arguments: [this]
            };
            // Add a "Clear" action when a filter is active
            if (label.startsWith('Filter: ')) {
                this.contextValue = 'filterWithClear';
            }
        } else if (context === 'showAllTags') {
            this.iconPath = new vscode.ThemeIcon('expand-all');
            this.command = {
                command: 'gitlabRegistryExplorer.showAllTags',
                title: 'Show All Tags',
                arguments: [this]
            };
        }
    }
}

// TreeDataProvider implementation
class GitLabRegistryProvider implements vscode.TreeDataProvider<TreeItemWithContext> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItemWithContext | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private context: vscode.ExtensionContext;
    private cachedProjects: GitLabProject[] = [];
    private cachedTags: Map<number, GitLabTag[]> = new Map(); // Cache tags per repoId
    private showAllTagsForRepo: Set<number> = new Set(); // Track which repos should show all tags
    private searchQuery = '';
    private filterTagsQueries: Map<number, string> = new Map(); // Store filter query per repoId

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Load cached projects on initialization
        this.loadCachedProjects();
    }

    refresh(): void {
        this.cachedProjects = [];
        this.cachedTags.clear(); // Clear tag cache
        this.showAllTagsForRepo.clear(); // Clear show-all state
        this.filterTagsQueries.clear(); // Clear all filters
        this.saveCachedProjects(); // Clear project cache
        this._onDidChangeTreeData.fire();
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query.toLowerCase().trim();
        this._onDidChangeTreeData.fire();
    }

    // New method to access the current search query
    getSearchQuery(): string {
        return this.searchQuery;
    }

    setFilterTagsQuery(repoId: number, query: string): void {
        if (query) {
            this.filterTagsQueries.set(repoId, query.toLowerCase().trim());
        } else {
            this.filterTagsQueries.delete(repoId);
        }
        this._onDidChangeTreeData.fire();
    }

    getFilterTagsQuery(repoId: number): string {
        return this.filterTagsQueries.get(repoId) || '';
    }

    getCachedTags(repoId: number): GitLabTag[] {
        return this.cachedTags.get(repoId) || [];
    }

    getCachedProjects(): GitLabProject[] {
        return this.cachedProjects;
    }

    clearFilters(): void {
        this.searchQuery = '';
        this.filterTagsQueries.clear();
        this.showAllTagsForRepo.clear();
        // Collapse the entire tree view using VSCode's built-in command
        vscode.commands.executeCommand('workbench.actions.treeView.gitlabRegistryExplorer.collapseAll');
        this._onDidChangeTreeData.fire(undefined);
    }

    clearFilterForRepo(repoId: number): void {
        this.filterTagsQueries.delete(repoId);
        this._onDidChangeTreeData.fire();
    }

    showAllTags(repoId: number): void {
        this.showAllTagsForRepo.add(repoId);
        this._onDidChangeTreeData.fire();
    }

    clearShowAllTagsForRepo(repoId: number): void {
        this.showAllTagsForRepo.delete(repoId);
        this._onDidChangeTreeData.fire();
    }

    private async loadCachedProjects() {
        const cached = await this.context.globalState.get('cachedProjects', []);
        if (Array.isArray(cached)) {
            this.cachedProjects = cached;
        }
    }

    private async saveCachedProjects() {
        await this.context.globalState.update('cachedProjects', this.cachedProjects);
    }

    getFilteredProjects(): GitLabProject[] {
        if (!this.searchQuery) return this.cachedProjects;
        return this.cachedProjects.filter(p =>
            p.path_with_namespace.toLowerCase().includes(this.searchQuery)
        );
    }

    async getChildren(element?: TreeItemWithContext): Promise<TreeItemWithContext[]> {
        const token = await this.context.secrets.get('gitlabToken');
        if (!token) return [];

        // Root level: Show folders or filtered projects
        if (!element) {
            if (this.cachedProjects.length === 0) {
                this.cachedProjects = await this.fetchProjects(token);
                await this.saveCachedProjects(); // Save to cache
            }

            const filteredProjects = this.getFilteredProjects();

            if (filteredProjects.length === 0) {
                return [new TreeItemWithContext('No projects found', vscode.TreeItemCollapsibleState.None, 'tag')];
            }

            if (this.searchQuery) {
                return filteredProjects
                    .map(p => {
                        // When searching, include the group/subgroup in the label
                        const namespacePath = p.path_with_namespace.substring(0, p.path_with_namespace.lastIndexOf('/'));
                        const label = `${p.name} (${namespacePath})`;
                        return new TreeItemWithContext(
                            label,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'project',
                            p.path_with_namespace,
                            p.id
                        );
                    })
                    .sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
            } else {
                const rootFolders = new Set<string>();
                for (const p of filteredProjects) {
                    const root = p.namespace.full_path.split('/')[0];
                    rootFolders.add(root);
                }
                return Array.from(rootFolders)
                    .sort()
                    .map(root => new TreeItemWithContext(root, vscode.TreeItemCollapsibleState.Collapsed, 'folder', root));
            }
        }

        // Folder level: Show projects and subfolders
        if (element.context === 'folder') {
            if (element.fullPath === undefined) {
                console.error('Folder element is missing fullPath:', element);
                return [];
            }

            const directProjects = this.cachedProjects.filter(p => p.namespace.full_path === element.fullPath);
            const projectItems = directProjects.map(p =>
                new TreeItemWithContext(
                    p.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'project',
                    p.path_with_namespace,
                    p.id
                )
            );

            const subfolderPaths = new Set<string>();
            for (const p of this.cachedProjects) {
                if (p.namespace.full_path.startsWith(element.fullPath + '/')) {
                    const relativePath = p.namespace.full_path.slice(element.fullPath.length + 1);
                    const nextSegment = relativePath.split('/')[0];
                    subfolderPaths.add(`${element.fullPath}/${nextSegment}`);
                }
            }
            const folderItems = Array.from(subfolderPaths).map(path =>
                new TreeItemWithContext(
                    path.split('/').pop()!,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder',
                    path
                )
            );

            return [...projectItems, ...folderItems].sort((a, b) =>
                a.label!.toString().localeCompare(b.label!.toString())
            );
        }

        // Project level: Show repositories
        if (element.context === 'project' && element.projectId) {
            const repos = await this.fetchRegistryRepos(token, element.projectId);
            return repos.map(repo =>
                new TreeItemWithContext(
                    `Repository: ${repo.path}`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'repo',
                    element.fullPath,
                    element.projectId,
                    repo.id
                )
            );
        }

        // Repository level: Show filter input and tags
        if (element.context === 'repo' && element.projectId && element.repoId) {
            const project = this.cachedProjects.find(p => p.id === element.projectId);
            const repoPath = element.label!.toString().replace('Repository: ', '');

            // Fetch tags if not already cached
            let tags = this.cachedTags.get(element.repoId);
            if (!tags) {
                tags = await this.fetchRegistryTags(token, element.projectId, element.repoId);
                this.cachedTags.set(element.repoId, tags);
            }

            // Filter tags locally based on the filterTagsQuery for this repo
            const filterTagsQuery = this.getFilterTagsQuery(element.repoId);
            const filteredTags = filterTagsQuery
                ? tags.filter(tag => tag.name.toLowerCase().includes(filterTagsQuery))
                : tags;

            // Create the filter input tree item
            const filterItem = new TreeItemWithContext(
                filterTagsQuery ? `Filter: ${filterTagsQuery}` : 'Filter tags...',
                vscode.TreeItemCollapsibleState.None,
                'filter',
                element.fullPath,
                element.projectId,
                element.repoId
            );

            // If no tags match the filter, show a message
            if (filteredTags.length === 0) {
                return [
                    filterItem,
                    new TreeItemWithContext('No tags match the filter', vscode.TreeItemCollapsibleState.None, 'tag')
                ];
            }

            // Determine how many tags to display based on the setting
            const maxTagsToDisplay = vscode.workspace.getConfiguration('gitlabRegistryExplorer').get<number>('maxTagsToDisplay', 50);
            const showAll = this.showAllTagsForRepo.has(element.repoId);
            const tagsToShow = showAll ? filteredTags : filteredTags.slice(0, maxTagsToDisplay);

            // Map the filtered tags to tree items
            const tagItems = tagsToShow.map(tag => {
                const imageUrl = `registry.gitlab.com/${project?.path_with_namespace}:${tag.name}`;
                const label = `${tag.name}  —  ${tag.created_at ? new Date(tag.created_at).toLocaleString() : 'unknown date'} (${formatBytes(tag.total_size)})`;
                return new TreeItemWithContext(
                    label,
                    vscode.TreeItemCollapsibleState.None,
                    'tag',
                    element.fullPath,
                    element.projectId,
                    element.repoId,
                    tag.name,
                    imageUrl
                );
            });

            // Add a "Show All Tags…" button if there are more tags to display
            const remainingTags = filteredTags.length - tagsToShow.length;
            const showAllItem = remainingTags > 0
                ? [new TreeItemWithContext(
                    `Show All Tags… (${remainingTags} more)`,
                    vscode.TreeItemCollapsibleState.None,
                    'showAllTags',
                    element.fullPath,
                    element.projectId,
                    element.repoId
                )]
                : [];

            // Return the filter input followed by the tags and the "Show All Tags…" button (if applicable)
            return [filterItem, ...tagItems, ...showAllItem];
        }

        return [];
    }

    getTreeItem(element: TreeItemWithContext): vscode.TreeItem {
        return element;
    }

    private async fetchProjects(token: string): Promise<GitLabProject[]> {
        let page = 1;
        let projects: GitLabProject[] = [];
        while (true) {
            const res = await fetch(`https://gitlab.com/api/v4/projects?membership=true&per_page=100&page=${page}`, {
                headers: { 'PRIVATE-TOKEN': token }
            });
            if (!res.ok) {
                vscode.window.showErrorMessage('Failed to fetch projects. Check your token and network connection.');
                break;
            }
            const pageProjects = await res.json() as GitLabProject[];
            if (pageProjects.length === 0) break;

            // Filter projects by checking if they have container registry repositories
            const projectChecks = pageProjects.map(async (project) => {
                // Skip projects where container registry is disabled
                if (!project.container_registry_enabled) return null;

                // Check if the project has any repositories
                const reposRes = await fetch(`https://gitlab.com/api/v4/projects/${project.id}/registry/repositories`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });
                if (reposRes.ok) {
                    const repos = await reposRes.json();
                    if (Array.isArray(repos) && repos.length > 0) {
                        return project;
                    }
                }
                return null;
            });

            // Wait for all checks to complete and filter out null results
            const filteredPageProjects = (await Promise.all(projectChecks)).filter((p): p is GitLabProject => p !== null);

            projects = projects.concat(filteredPageProjects);
            page++;
        }
        return projects;
    }

    private async fetchRegistryRepos(token: string, projectId: number): Promise<GitLabRegistryRepo[]> {
        const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/registry/repositories`, {
            headers: { 'PRIVATE-TOKEN': token }
        });
        if (!res.ok) return [];
        return await res.json() as GitLabRegistryRepo[];
    }

    private async fetchRegistryTags(token: string, projectId: number, repoId: number): Promise<GitLabTag[]> {
        let page = 1;
        let allTags: GitLabTag[] = [];
        while (true) {
            const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/registry/repositories/${repoId}/tags?per_page=100&page=${page}`, {
                headers: { 'PRIVATE-TOKEN': token }
            });
            if (!res.ok) break;
            const pageTags = await res.json() as GitLabTag[];
            if (pageTags.length === 0) break;
            allTags = allTags.concat(pageTags);
            page++;
        }

        const enrichedTags = await Promise.all(
            allTags.map(async tag => {
                const detailRes = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/registry/repositories/${repoId}/tags/${encodeURIComponent(tag.name)}`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });
                if (!detailRes.ok) return { name: tag.name };
                const detail = await detailRes.json();
                return {
                    name: tag.name,
                    created_at: detail.created_at,
                    total_size: detail.total_size // Fetch the total_size field (in bytes)
                };
            })
        );

        return enrichedTags.sort(
            (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        );
    }
}

// Extension activation
export function activate(context: vscode.ExtensionContext) {
    const explorerProvider = new GitLabRegistryProvider(context);
    const treeView = vscode.window.createTreeView('gitlabRegistryExplorer', {
        treeDataProvider: explorerProvider,
    });

    // Clear the filter and "show all tags" state when a repository is collapsed
    treeView.onDidCollapseElement(event => {
        if (event.element.context === 'repo' && event.element.repoId) {
            explorerProvider.clearFilterForRepo(event.element.repoId);
            explorerProvider.clearShowAllTagsForRepo(event.element.repoId);
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabRegistryExplorer.refresh', () =>
            explorerProvider.refresh()
        ),
        vscode.commands.registerCommand('gitlabRegistryExplorer.setToken', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your GitLab Personal Access Token (with read_registry)',
                ignoreFocusOut: true,
                password: true,
            });
            if (token) {
                await context.secrets.store('gitlabToken', token);
                explorerProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.searchProjects', async () => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Search GitLab Registry Projects (e.g., my-project, group/subgroup/project)';
            quickPick.value = explorerProvider.getSearchQuery();
            quickPick.ignoreFocusOut = true;
        
            const projects = explorerProvider.getCachedProjects();
            quickPick.items = projects.map(project => ({ label: project.path_with_namespace }));
        
            quickPick.onDidChangeValue(query => {
                explorerProvider.setSearchQuery(query);
                const lowerQuery = query.toLowerCase().trim();
                const filteredItems = projects
                    .filter(project => lowerQuery ? project.path_with_namespace.toLowerCase().includes(lowerQuery) : true)
                    .map(project => ({ label: project.path_with_namespace }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                quickPick.items = filteredItems;
                quickPick.activeItems = [];
            });
        
            quickPick.onDidAccept(() => {
                // If a suggestion is selected, use the selected item's label; otherwise, use the typed query
                const selectedItem = quickPick.selectedItems[0];
                const query = selectedItem ? selectedItem.label : quickPick.value;
                explorerProvider.setSearchQuery(query);
                quickPick.dispose();
            });
        
            quickPick.onDidHide(() => {
                quickPick.dispose();
            });
        
            quickPick.show();
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.clearFilters', () =>
            explorerProvider.clearFilters()
        ),
        vscode.commands.registerCommand('gitlabRegistryExplorer.filterTagsInline', async (item: TreeItemWithContext) => {
            if (!item.repoId) return;
        
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Filter tags by name (e.g., latest, 14-...)';
            quickPick.value = explorerProvider.getFilterTagsQuery(item.repoId);
            quickPick.ignoreFocusOut = true;
        
            const tags = explorerProvider.getCachedTags(item.repoId);
            quickPick.items = tags
                .map(tag => ({ label: tag.name }))
                .sort((a, b) => a.label.localeCompare(b.label));
        
            quickPick.onDidChangeValue(query => {
                const lowerQuery = query.toLowerCase().trim();
                explorerProvider.setFilterTagsQuery(item.repoId!, query);
                quickPick.items = tags
                    .filter(tag => tag.name.toLowerCase().includes(lowerQuery))
                    .map(tag => ({ label: tag.name }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                // Prevent auto-selection of the first suggestion, similar to project search
                quickPick.activeItems = [];
            });
        
            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0];
                const query = selectedItem ? selectedItem.label : quickPick.value;
                explorerProvider.setFilterTagsQuery(item.repoId!, query);
                quickPick.dispose();
            });
        
            quickPick.onDidHide(() => {
                quickPick.dispose();
            });
        
            quickPick.show();
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.clearTagFilter', (item: TreeItemWithContext) => {
            if (item.repoId) {
                explorerProvider.clearFilterForRepo(item.repoId);
            }
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.copyImageUrl', (item: TreeItemWithContext) => {
            if (item.context === 'tag' && item.imageUrl) {
                vscode.env.clipboard.writeText(item.imageUrl);
                vscode.window.showInformationMessage(`Copied to clipboard: ${item.imageUrl}`);
            } else {
                vscode.window.showErrorMessage('Unable to copy image URL.');
            }
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.executeDockerPull', (item: TreeItemWithContext) => {
            if (item.context === 'tag' && item.imageUrl) {
                const dockerPullCommand = `docker pull ${item.imageUrl}`;
                // Create or reuse a terminal named "GitLab Registry"
                const terminal = vscode.window.terminals.find(t => t.name === 'GitLab Registry') || vscode.window.createTerminal('GitLab Registry');
                terminal.show(); // Show the terminal
                terminal.sendText(dockerPullCommand); // Execute the command
                vscode.window.showInformationMessage(`Executing: ${dockerPullCommand}`);
            } else {
                vscode.window.showErrorMessage('Unable to execute Docker pull command.');
            }
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.scanImageWithTrivy', (item: TreeItemWithContext) => {
            if (item.context === 'tag' && item.imageUrl) {
                const trivyScanCommand = `trivy image ${item.imageUrl}`;
                // Create or reuse a terminal named "GitLab Registry Trivy Scan"
                const terminal = vscode.window.terminals.find(t => t.name === 'GitLab Registry Trivy Scan') || vscode.window.createTerminal('GitLab Registry Trivy Scan');
                terminal.show(); // Show the terminal
                terminal.sendText(trivyScanCommand); // Execute the Trivy scan command
                vscode.window.showInformationMessage(`Scanning image with Trivy: ${trivyScanCommand}`);
            } else {
                vscode.window.showErrorMessage('Unable to scan image with Trivy.');
            }
        }),
        vscode.commands.registerCommand('gitlabRegistryExplorer.showAllTags', (item: TreeItemWithContext) => {
            if (item.repoId) {
                explorerProvider.showAllTags(item.repoId);
            }
        }),
        treeView
    );

    context.secrets.get('gitlabToken').then(token => {
        if (!token) vscode.commands.executeCommand('gitlabRegistryExplorer.setToken');
    });
}

export function deactivate() {}