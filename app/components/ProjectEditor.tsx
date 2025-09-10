"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { BulletPointEditor } from "./BulletPointEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProjectEditorProps {
  project: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  };
  onUpdate?: () => void;
  onDelete?: () => void;
  isDraggable?: boolean;
}

interface SortableBulletPointProps {
  bulletPoint: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  };
}

function SortableBulletPoint({ bulletPoint }: SortableBulletPointProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bulletPoint._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "relative",
        isDragging && "z-50 opacity-50"
      )}
    >
      <BulletPointEditor
        bulletPoint={bulletPoint}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function ProjectEditor({ 
  project, 
  onUpdate,
  onDelete,
  isDraggable = true
}: ProjectEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description || "");
  const [showBulletForm, setShowBulletForm] = useState(false);
  const [newBulletContent, setNewBulletContent] = useState("");
  const [activeBulletId, setActiveBulletId] = useState<Id<"bulletPoints"> | null>(null);
  const [optimisticBulletPoints, setOptimisticBulletPoints] = useState<{
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] | null>(null);
  
  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.remove);
  const createBulletPoint = useMutation(api.bulletPoints.create);
  const reorderBulletPoint = useMutation(api.bulletPoints.reorder);
  
  const bulletPoints = useQuery(api.bulletPoints.list, { 
    projectId: project._id 
  });

  // Use optimistic updates if available, otherwise use real data
  const displayBulletPoints = optimisticBulletPoints || bulletPoints;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSave = async () => {
    await updateProject({
      id: project._id,
      title: title,
      description: description || undefined,
    });
    setIsEditing(false);
    onUpdate?.();
  };

  const handleDelete = async () => {
    if (confirm("Delete this project and all its content?")) {
      await deleteProject({ id: project._id });
      onDelete?.();
    }
  };

  const handleAddBulletPoint = async () => {
    if (newBulletContent.trim()) {
      await createBulletPoint({
        projectId: project._id,
        content: newBulletContent,
      });
      setNewBulletContent("");
      setShowBulletForm(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveBulletId(event.active.id as Id<"bulletPoints">);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBulletId(null);

    if (!over || active.id === over.id || !bulletPoints) return;

    const oldIndex = bulletPoints.findIndex((bp) => bp._id === active.id);
    const newIndex = bulletPoints.findIndex((bp) => bp._id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Create new order array for optimistic update
      const newOrder = arrayMove(bulletPoints, oldIndex, newIndex);
      setOptimisticBulletPoints(newOrder);
      
      // Call reorder with the new order
      try {
        await reorderBulletPoint({ 
          projectId: project._id,
          bulletPointIds: newOrder.map(bp => bp._id)
        });
      } finally {
        // Clear optimistic state after server update
        setOptimisticBulletPoints(null);
      }
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: project._id,
    disabled: !isDraggable 
  });

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : {};

  const activeBullet = activeBulletId 
    ? displayBulletPoints?.find(bp => bp._id === activeBulletId) 
    : null;

  return (
    <Card 
      className={cn("p-6 group", isDragging && "opacity-50")}
      ref={setNodeRef} 
      style={style}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        {isDraggable && (
          <div 
            className="cursor-move pt-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" strokeWidth={1.5} />
          </div>
        )}

        <div className="flex-1 space-y-4">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-semibold"
                placeholder="Project Title"
                autoFocus
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px]"
                placeholder="Project Description (optional)"
              />
              <div className="flex gap-2">
                <Button onClick={handleSave} size="sm" variant="default">
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setTitle(project.title);
                    setDescription(project.description || "");
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
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold">{project.title}</h3>
                  {project.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    onClick={() => setIsEditing(true)}
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Edit
                  </Button>
                  <Button
                    onClick={handleDelete}
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 gap-1 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Bullet Points
                  </h4>
                  <Button
                    onClick={() => setShowBulletForm(true)}
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.5} />
                    Add Bullet Point
                  </Button>
                </div>

                {showBulletForm && (
                  <Card className="p-3">
                    <Textarea
                      value={newBulletContent}
                      onChange={(e) => setNewBulletContent(e.target.value)}
                      placeholder="Enter bullet point content..."
                      className="min-h-[60px] text-[15px] leading-7"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <Button onClick={handleAddBulletPoint} size="sm" variant="default">
                        Add Bullet Point
                      </Button>
                      <Button
                        onClick={() => {
                          setNewBulletContent("");
                          setShowBulletForm(false);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </div>
                  </Card>
                )}

                {displayBulletPoints && displayBulletPoints.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={displayBulletPoints.map(bp => bp._id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {displayBulletPoints.map((bulletPoint) => (
                          <SortableBulletPoint
                            key={bulletPoint._id}
                            bulletPoint={bulletPoint}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeBullet ? (
                        <div className="shadow-lg rounded-md opacity-90">
                          <BulletPointEditor
                            bulletPoint={activeBullet}
                            dragHandleProps={{}}
                          />
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  !showBulletForm && (
                    <p className="text-sm text-muted-foreground italic">
                      No bullet points yet. Add one to get started.
                    </p>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}