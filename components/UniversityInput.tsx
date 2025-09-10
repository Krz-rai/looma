"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Top universities list
const UNIVERSITIES = [
  // Ivy League
  "Harvard University",
  "Yale University",
  "Princeton University",
  "Columbia University",
  "University of Pennsylvania",
  "Brown University",
  "Cornell University",
  "Dartmouth College",
  
  // Top US Universities
  "Massachusetts Institute of Technology",
  "Stanford University",
  "California Institute of Technology",
  "University of Chicago",
  "Duke University",
  "Johns Hopkins University",
  "Northwestern University",
  "Vanderbilt University",
  "Rice University",
  "University of Notre Dame",
  "Georgetown University",
  "University of California, Berkeley",
  "University of California, Los Angeles",
  "University of Southern California",
  "Carnegie Mellon University",
  "University of Michigan",
  "New York University",
  "Boston University",
  "Northeastern University",
  "Georgia Institute of Technology",
  "University of Virginia",
  "University of North Carolina at Chapel Hill",
  "Wake Forest University",
  "University of Rochester",
  "Boston College",
  "Tufts University",
  "University of Florida",
  "University of California, San Diego",
  "University of California, Davis",
  "University of California, Santa Barbara",
  "University of California, Irvine",
  "University of Texas at Austin",
  "University of Wisconsin-Madison",
  "University of Illinois at Urbana-Champaign",
  "University of Washington",
  "Ohio State University",
  "Purdue University",
  "Pennsylvania State University",
  "University of Maryland",
  "University of Pittsburgh",
  "University of Minnesota",
  "Rutgers University",
  "Indiana University",
  "Michigan State University",
  "University of Iowa",
  "Virginia Tech",
  "Texas A&M University",
  "University of Colorado Boulder",
  "North Carolina State University",
  "Arizona State University",
  "University of Arizona",
  "University of Oregon",
  "University of Utah",
  "Drexel University",
  "Temple University",
  "Villanova University",
  
  // International
  "University of Oxford",
  "University of Cambridge",
  "Imperial College London",
  "University College London",
  "London School of Economics",
  "University of Edinburgh",
  "King's College London",
  "University of Manchester",
  "University of Toronto",
  "McGill University",
  "University of British Columbia",
  "University of Waterloo",
  "Australian National University",
  "University of Melbourne",
  "University of Sydney",
  "National University of Singapore",
  "Nanyang Technological University",
  "ETH Zurich",
  "University of Tokyo",
  "Tsinghua University",
  "Peking University",
  "Indian Institute of Technology",
];

interface UniversityInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function UniversityInput({ value, onChange, placeholder, className }: UniversityInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [filteredUniversities, setFilteredUniversities] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (search) {
      const filtered = UNIVERSITIES.filter(uni =>
        uni.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8);
      setFilteredUniversities(filtered);
    } else {
      setFilteredUniversities(UNIVERSITIES.slice(0, 8));
    }
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (university: string) => {
    setSearch(university);
    onChange(university);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder || "Search universities..."}
        className={className}
      />
      {isOpen && filteredUniversities.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredUniversities.map((university, index) => (
            <button
              key={index}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                university === search && "bg-muted"
              )}
              onClick={() => handleSelect(university)}
            >
              {university}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}