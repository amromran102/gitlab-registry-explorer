# GitLab Registry Explorer

A Visual Studio Code extension to explore and manage container registry repositories and tags in GitLab.

## Features

- Browse GitLab projects with container registries in a tree view.
- View repositories and their tags, including tag creation dates and sizes.
- Search for projects by name or path (e.g., `group/subgroup/project`).
- Filter tags within a repository by name (e.g., `latest`, `14-...`).
- Copy container image URLs to the clipboard.
- Execute `docker pull` commands directly from the tree view.
- Scan images with Trivy for vulnerabilities.
- Support for pagination and large tag lists with a "Show All Tags…" option.

## Installation

1. **Install the Extension**:
   - Open VSCode.
   - Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X` on macOS).
   - Search for "GitLab Registry Explorer".
   - Click **Install**.

2. **Set Up Your GitLab Token**:
   - After installing, the extension will prompt you to enter your GitLab Personal Access Token.
   - Alternatively, run the command `GitLab Registry Explorer: Set GitLab Token` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS).
   - Create a token in GitLab with the `read_registry` scope:
     - Go to your GitLab profile → **Access Tokens**.
     - Generate a token with `read_registry` permissions.
     - Copy the token and paste it into the VSCode prompt.

## Usage

1. **Open the Explorer**:
   - After setting your token, the "GitLab Registry: Projects" view will appear in the Activity Bar.
   - The tree view shows your GitLab groups, subgroups, projects, repositories, and tags.

2. **Browse Projects and Repositories**:
   - Expand groups (e.g., `group`) to see subgroups, projects, and repositories.
   - Expand a repository to see its tags, including creation dates and sizes (e.g., `2023-10-15 14:30 (25.5 MB)`).

3. **Search for Projects**:
   - Click the search icon (`🔍`) in the view title bar or run `GitLab Registry Explorer: Search Projects` from the Command Palette.
   - Enter a query (e.g., `group/subgroup/project`) to filter projects.

4. **Filter Tags**:
   - In a repository, click the "Filter tags..." item to filter tags by name (e.g., `6.0-beta`).
   - Clear the filter by right-clicking the "Filtered by: <tag>" item and selecting `Clear Tag Filter` (with the `✖` icon).

5. **Manage Tags**:
   - Right-click a tag to access the following actions:
     - **Copy Image URL** (`📋`): Copy the container image URL (e.g., `registry.gitlab.com/group/subgroup/project:6.0-beta`) to the clipboard.
     - **Execute Docker Pull** (`⬇️`): Run `docker pull` for the image in a new terminal.
     - **Scan with Trivy** (`🐞`): Run a Trivy vulnerability scan for the image in a new terminal.

6. **Show More Tags**:
   - If a repository has more tags than the configured limit (default: 20), a "Show All Tags…" item will appear.
   - Right-click it and select `Show All Tags` (`↕️`) to display all tags.

7. **Clear Filters and Collapse**:
   - Click the "Clear Filters" button (`✖`) in the view title bar or run `GitLab Registry Explorer: Clear Filters` to clear all filters and collapse the tree back to the top-level projects.

*Note*: Use the "Refresh" button (`🔄`) in the view title bar or run `GitLab Registry Explorer: Refresh` to clear cached data and fetch the latest projects and tags from GitLab.

## Configuration

The extension supports the following settings:

- `gitlabRegistryExplorer.maxTagsToDisplay`:
  - **Default**: `20`
  - **Description**: The maximum number of tags to display in a repository before showing the "Show All Tags…" item. Set to a higher value (e.g., `50`) to display more tags by default.
  - **Example**: In VSCode settings, set `"gitlabRegistryExplorer.maxTagsToDisplay": 50`.

To configure:
1. Go to **File → Preferences → Settings** (or `Ctrl+,`/`Cmd+,` on macOS).
2. Search for `gitlabRegistryExplorer`.
3. Update the settings as needed.

## Commands

### Command Palette Commands

The following commands are available in the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS):

- `GitLab Registry Explorer: Set GitLab Token`: Set or update your GitLab Personal Access Token.
- `GitLab Registry Explorer: Refresh`: Clear all cached data and fetch the latest projects and tags.
- `GitLab Registry Explorer: Search Projects`: Search for projects by name or path.
- `GitLab Registry Explorer: Clear Filters`: Clear all filters and collapse the tree to the top-level projects.

### Tree View Context Menu Commands

The following commands are available by right-clicking items in the "GitLab Registry: Projects" tree view:

- **On a Tag**:
  - `GitLab Registry Explorer: Copy Image URL` (`📋`): Copy the image URL to the clipboard.
  - `GitLab Registry Explorer: Docker Pull` (`⬇️`): Run `docker pull` for the image in a terminal.
  - `GitLab Registry Explorer: Scan Image with Trivy` (`🐞`): Run a Trivy vulnerability scan for the image in the terminal.
- **On a Tag Filter** (appears after filtering tags):
  - `GitLab Registry Explorer: Clear Tag Filter` (`✖`): Clear the tag filter for the repository.
- **On a "Show All Tags…" Item** (appears when there are more tags to show):
  - `GitLab Registry Explorer: Show All Tags` (`↕️`): Display all tags for the repository, bypassing the default limit.

## Requirements

- A GitLab Personal Access Token with the `read_registry` scope.
- Docker installed on your system to use the `Execute Docker Pull` command.
- Trivy installed on your system to use the `Scan Image with Trivy` command.

## Troubleshooting

- **"Failed to fetch projects" Error**:
  - Ensure your GitLab token has the `read_registry` scope.
  - Check your internet connection.
  - Run `GitLab Registry Explorer: Set GitLab Token` to update your token.

- **Tags Not Updating**:
  - Use the "Refresh" command (`GitLab Registry Explorer: Refresh`) to clear the cache and fetch the latest tags.

- **Tree View Not Collapsing**:
  - Ensure you’re using the latest version of the extension.
  - Use the "Clear Filters" command (`GitLab Registry Explorer: Clear Filters`) to collapse the tree.

For further assistance, file an issue on the [GitHub repository](https://github.com/amromran102/gitlab-registry-explorer).

## License

MIT License

Copyright (c) 2025 Amr Omran

See the [LICENSE](LICENSE) file for details.

## Support

For bugs, feature requests, or questions, please open an issue on the [GitHub repository](https://github.com/amromran102/gitlab-registry-explorer).