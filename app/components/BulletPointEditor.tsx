"use client";

import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { GripVertical, Pencil, GitBranch, Trash2, X } from "lucide-react";

interface BulletPointEditorProps {
  bulletPoint: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  };
  onUpdate?: () => void;
  onDelete?: () => void;
  dragHandleProps?: Record<string, unknown>;
}

export function BulletPointEditor({ 
  bulletPoint, 
  onUpdate,
  onDelete,
  dragHandleProps 
}: BulletPointEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(bulletPoint.content);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [newBranchContent, setNewBranchContent] = useState("");
  const [editingBranchId, setEditingBranchId] = useState<Id<"branches"> | null>(null);
  const [editingBranchContent, setEditingBranchContent] = useState("");
  
  const updateBulletPoint = useMutation(api.bulletPoints.update);
  const deleteBulletPoint = useMutation(api.bulletPoints.remove);
  const createBranchWithEmbeddings = useAction(api.embedActions.createBranchWithEmbeddings);
  const updateBranch = useMutation(api.branches.update);
  const deleteBranch = useMutation(api.branches.remove);
  
  const branches = useQuery(api.branches.list, { 
    bulletPointId: bulletPoint._id 
  });

  const handleSave = async () => {
    await updateBulletPoint({
      id: bulletPoint._id,
      content: content,
    });
    setIsEditing(false);
    onUpdate?.();
  };

  const handleDelete = async () => {
    if (confirm("Delete this bullet point and all its branches?")) {
      await deleteBulletPoint({ id: bulletPoint._id });
      onDelete?.();
    }
  };

  const handleAddBranch = async () => {
    if (newBranchContent.trim()) {
      await createBranchWithEmbeddings({
        bulletPointId: bulletPoint._id,
        content: newBranchContent,
        type: "text",
      });
      setNewBranchContent("");
      setShowBranchForm(false);
    }
  };

  const handleUpdateBranch = async (branchId: Id<"branches">) => {
    if (editingBranchContent.trim()) {
      await updateBranch({
        id: branchId,
        content: editingBranchContent,
      });
      setEditingBranchId(null);
      setEditingBranchContent("");
    }
  };

  const handleDeleteBranch = async (branchId: Id<"branches">) => {
    if (confirm("Delete this branch?")) {
      await deleteBranch({ id: branchId });
    }
  };

  return (
    <div className="group relative">
      <div className="flex items-start gap-2 w-full">
        {/* Drag handle */}
        <div 
          className="cursor-move pt-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {/* Bullet point content */}
          <div className="flex items-start gap-2">
            <span className="text-[15px] text-muted-foreground mt-1 flex-shrink-0">•</span>
            {isEditing ? (
              <div className="flex-1 space-y-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[60px] text-[15px] leading-7"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" variant="default">
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setContent(bulletPoint.content);
                      setIsEditing(false);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-[15px] leading-7 break-words">{bulletPoint.content}</p>
                
                {/* Action buttons */}
                <div className="flex gap-1 mt-2">
                    <Button
                      onClick={() => setIsEditing(true)}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1"
                    >
                      <Pencil className="h-3 w-3" strokeWidth={1.5} />
                      Edit
                    </Button>
                    <Button
                      onClick={() => setShowBranchForm(true)}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1"
                    >
                      <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                      Add Branch
                    </Button>
                    <Button
                      onClick={handleDelete}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                      Delete
                    </Button>
                </div>
              </div>
            )}
          </div>

          {/* Branches - styled to look like actual branches */}
          {branches && branches.length > 0 && (
            <div className="ml-5 space-y-2">
              {branches.map((branch: Doc<"branches">, index: number) => (
                <div key={branch._id} className="relative">
                  {/* Branch connector line */}
                  <div className="absolute -left-4 top-3 w-3 h-px bg-border" />
                  {index < branches.length - 1 && (
                    <div className="absolute -left-4 top-3 bottom-0 w-px bg-border" />
                  )}
                  
                  <Card className="p-3 group/branch bg-muted/30 border-muted">
                    {editingBranchId === branch._id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingBranchContent}
                          onChange={(e) => setEditingBranchContent(e.target.value)}
                          className="min-h-[60px] text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleUpdateBranch(branch._id)}
                            size="sm"
                            variant="default"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={() => {
                              setEditingBranchId(null);
                              setEditingBranchContent("");
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <GitBranch className="h-3 w-3 mt-1 text-muted-foreground" strokeWidth={1.5} />
                          <p className="text-sm leading-6 text-foreground/80 flex-1">
                            {branch.content}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            onClick={() => {
                              setEditingBranchId(branch._id);
                              setEditingBranchContent(branch.content);
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                          <Button
                            onClick={() => handleDeleteBranch(branch._id)}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:text-destructive"
                          >
                            <X className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              ))}
            </div>
          )}

          {/* Add branch form */}
          {showBranchForm && (
            <Card className="ml-5 p-3">
              <div className="space-y-2">
                <p className="text-xs font-medium">Add Branch Content</p>
                <Textarea
                  value={newBranchContent}
                  onChange={(e) => setNewBranchContent(e.target.value)}
                  placeholder="Enter branch content that will be shown when expanded..."
                  className="min-h-[80px] text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button onClick={handleAddBranch} size="sm" variant="default">
                    Add Branch
                  </Button>
                  <Button
                    onClick={() => {
                      setNewBranchContent("");
                      setShowBranchForm(false);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
