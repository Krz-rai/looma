"use client";

import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id, Doc } from '../convex/_generated/dataModel';

interface DataFetcherProps {
  projects: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  }[];
  setBulletPointsByProject: (data: { [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] }) => void;
  setBranchesByBulletPoint: (data: { [key: string]: {
    _id: Id<"branches">;
    bulletPointId: Id<"bulletPoints">;
    content: string;
    type: string;
  }[] }) => void;
}

export function DataFetcher({ projects, setBulletPointsByProject, setBranchesByBulletPoint }: DataFetcherProps) {
  // This component fetches all bullet points and branches for the projects
  
  useEffect(() => {
    if (!projects) return;
    
    const fetchData = async () => {
      const bulletPointsData: { [key: string]: {
        _id: Id<"bulletPoints">;
        projectId: Id<"projects">;
        content: string;
        position: number;
        hasBranches: boolean;
      }[] } = {};
      const branchesData: { [key: string]: {
        _id: Id<"branches">;
        bulletPointId: Id<"bulletPoints">;
        content: string;
        type: string;
      }[] } = {};
      
      // Note: In a real app, you'd want to batch these queries or use a better data fetching strategy
      // For now, we'll just store empty arrays as placeholders
      projects.forEach(project => {
        bulletPointsData[project._id] = [];
        // You would fetch branches for each bullet point here
      });
      
      setBulletPointsByProject(bulletPointsData);
      setBranchesByBulletPoint(branchesData);
    };
    
    fetchData();
  }, [projects, setBulletPointsByProject, setBranchesByBulletPoint]);
  
  return null;
}

// Component to fetch bullet points for a project
export function ProjectDataFetcher({ 
  project, 
  onBulletPointsLoad,
  onBranchesLoad 
}: { 
  project: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  };
  onBulletPointsLoad: (projectId: string, bulletPoints: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[]) => void;
  onBranchesLoad?: (bulletPointId: string, branches: {
    _id: Id<"branches">;
    bulletPointId: Id<"bulletPoints">;
    content: string;
    type: string;
  }[]) => void;
}) {
  const bulletPoints = useQuery(api.bulletPoints.list, { 
    projectId: project._id 
  });
  
  useEffect(() => {
    if (bulletPoints && onBulletPointsLoad) {
      onBulletPointsLoad(project._id, bulletPoints);
    }
  }, [bulletPoints, project._id, onBulletPointsLoad]);
  
  return (
    <>
      {bulletPoints && onBranchesLoad && bulletPoints.map((bp: Doc<"bulletPoints">) => (
        <BranchFetcher
          key={bp._id}
          bulletPointId={bp._id}
          onBranchesLoad={onBranchesLoad}
        />
      ))}
    </>
  );
}

// Component to fetch branches for a bullet point
function BranchFetcher({ 
  bulletPointId, 
  onBranchesLoad 
}: { 
  bulletPointId: string;
  onBranchesLoad: (bulletPointId: string, branches: {
    _id: Id<"branches">;
    bulletPointId: Id<"bulletPoints">;
    content: string;
    type: string;
  }[]) => void;
}) {
  const branches = useQuery(api.branches.list, { 
    bulletPointId: bulletPointId as Id<"bulletPoints">
  });
  
  useEffect(() => {
    if (branches) {
      onBranchesLoad(bulletPointId, branches);
    }
  }, [branches, bulletPointId, onBranchesLoad]);
  
  return null;
}