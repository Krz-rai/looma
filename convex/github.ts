import { v } from "convex/values";
import { action } from "./_generated/server";

export const fetchGithubData = action({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    console.log('🐙 fetchGithubData called with username:', args.username);
    try {
      // Validate username format
      if (!args.username || !/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(args.username)) {
        console.log('❌ Invalid GitHub username format:', args.username);
        return {
          success: false,
          error: "Invalid GitHub username format",
          data: null
        };
      }

      // Fetch user profile
      const userResponse = await fetch(`https://api.github.com/users/${args.username}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Resume-Builder-App'
        }
      });

      if (!userResponse.ok) {
        if (userResponse.status === 404) {
          return {
            success: false,
            error: "GitHub user not found",
            data: null
          };
        }
        if (userResponse.status === 403) {
          return {
            success: false,
            error: "GitHub API rate limit exceeded. Please try again later.",
            data: null
          };
        }
        throw new Error(`GitHub API error: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      console.log('✅ GitHub user data fetched:', userData.login, userData.public_repos, 'repos');

      // Fetch repositories (up to 30 most recent)
      const reposResponse = await fetch(
        `https://api.github.com/users/${args.username}/repos?sort=updated&per_page=30`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Resume-Builder-App'
          }
        }
      );

      if (!reposResponse.ok) {
        if (reposResponse.status === 403) {
          return {
            success: false,
            error: "GitHub API rate limit exceeded. Please try again later.",
            data: null
          };
        }
        throw new Error(`GitHub API error: ${reposResponse.status}`);
      }

      const reposData = await reposResponse.json();

      // Process repositories
      const repositories = reposData
        .filter((repo: any) => !repo.fork) // Exclude forked repos
        .map((repo: any) => ({
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          homepage: repo.homepage,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          topics: repo.topics || [],
          updatedAt: repo.updated_at,
          createdAt: repo.created_at,
          isPrivate: repo.private,
          defaultBranch: repo.default_branch,
          size: repo.size,
          watchers: repo.watchers_count,
          openIssues: repo.open_issues_count,
          license: repo.license?.name || null,
          hasIssues: repo.has_issues,
          hasWiki: repo.has_wiki,
          hasPages: repo.has_pages,
          archived: repo.archived,
          disabled: repo.disabled
        }))
        .sort((a: any, b: any) => b.stars - a.stars); // Sort by stars

      // Calculate language statistics
      const languageStats: Record<string, number> = {};
      repositories.forEach((repo: any) => {
        if (repo.language) {
          languageStats[repo.language] = (languageStats[repo.language] || 0) + 1;
        }
      });

      // Sort languages by usage
      const topLanguages = Object.entries(languageStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([lang, count]) => ({ language: lang, count }));

      // Calculate metrics
      const totalStars = repositories.reduce((sum: number, repo: any) => sum + repo.stars, 0);
      const totalForks = repositories.reduce((sum: number, repo: any) => sum + repo.forks, 0);

      // No need to fetch README or languages - Gemini can search these on demand

      // Format the response
      const githubData = {
        profile: {
          username: userData.login,
          name: userData.name,
          bio: userData.bio,
          company: userData.company,
          location: userData.location,
          blog: userData.blog,
          email: userData.email,
          publicRepos: userData.public_repos,
          followers: userData.followers,
          following: userData.following,
          createdAt: userData.created_at,
          updatedAt: userData.updated_at,
          profileUrl: userData.html_url,
          avatarUrl: userData.avatar_url,
          hireable: userData.hireable,
          twitterUsername: userData.twitter_username
        },
        statistics: {
          totalRepositories: repositories.length,
          totalStars,
          totalForks,
          topLanguages,
          mostStarredRepo: repositories[0] || null
        },
        // Just include basic info and URLs - Gemini can search for details
        repositories: repositories.slice(0, 30), // Include more repos since we're not fetching details
        fetchedAt: new Date().toISOString()
      };

      return {
        success: true,
        error: null,
        data: githubData
      };

    } catch (error: any) {
      console.error("Error fetching GitHub data:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch GitHub data",
        data: null
      };
    }
  },
});