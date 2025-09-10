"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Common degrees
const DEGREES = [
  "Bachelor of Science (B.S.)",
  "Bachelor of Arts (B.A.)",
  "Bachelor of Engineering (B.E.)",
  "Bachelor of Technology (B.Tech)",
  "Bachelor of Business Administration (BBA)",
  "Bachelor of Fine Arts (BFA)",
  "Master of Science (M.S.)",
  "Master of Arts (M.A.)",
  "Master of Business Administration (MBA)",
  "Master of Engineering (M.Eng)",
  "Master of Technology (M.Tech)",
  "Master of Fine Arts (MFA)",
  "Master of Education (M.Ed)",
  "Master of Public Health (MPH)",
  "Master of Computer Applications (MCA)",
  "Doctor of Philosophy (Ph.D.)",
  "Doctor of Medicine (M.D.)",
  "Juris Doctor (J.D.)",
  "Doctor of Education (Ed.D.)",
  "Associate of Science (A.S.)",
  "Associate of Arts (A.A.)",
  "Associate of Applied Science (AAS)",
];

// Common majors
const MAJORS = [
  "Computer Science",
  "Software Engineering",
  "Computer Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Aerospace Engineering",
  "Biomedical Engineering",
  "Information Technology",
  "Information Systems",
  "Data Science",
  "Artificial Intelligence",
  "Machine Learning",
  "Cybersecurity",
  "Mathematics",
  "Applied Mathematics",
  "Statistics",
  "Physics",
  "Chemistry",
  "Biology",
  "Biochemistry",
  "Biotechnology",
  "Business Administration",
  "Finance",
  "Accounting",
  "Marketing",
  "Management",
  "Economics",
  "International Business",
  "Psychology",
  "Sociology",
  "Political Science",
  "International Relations",
  "English",
  "Communications",
  "Journalism",
  "History",
  "Philosophy",
  "Art",
  "Design",
  "Architecture",
  "Music",
  "Film Studies",
  "Nursing",
  "Medicine",
  "Public Health",
  "Environmental Science",
  "Environmental Engineering",
];

interface DropdownInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  options: string[];
}

function DropdownInput({ value, onChange, placeholder, className, options }: DropdownInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (search) {
      const filtered = options.filter(option =>
        option.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8);
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions(options.slice(0, 8));
    }
  }, [search, options]);

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

  const handleSelect = (option: string) => {
    setSearch(option);
    onChange(option);
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
        placeholder={placeholder}
        className={className}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.map((option, index) => (
            <button
              key={index}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                option === search && "bg-muted"
              )}
              onClick={() => handleSelect(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DegreeInput(props: Omit<DropdownInputProps, 'options'>) {
  return <DropdownInput {...props} options={DEGREES} placeholder={props.placeholder || "Select degree..."} />;
}

export function MajorInput(props: Omit<DropdownInputProps, 'options'>) {
  return <DropdownInput {...props} options={MAJORS} placeholder={props.placeholder || "Select major..."} />;
}

interface GraduationDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Generate years from 1970 to 2030
const YEARS = Array.from({ length: 61 }, (_, i) => (2030 - i).toString());

export function GraduationDatePicker({ value, onChange, className }: GraduationDatePickerProps) {
  // Parse the value if it exists (format: "Month Year")
  const [selectedMonth, selectedYear] = value ? value.split(" ") : ["", ""];
  
  const handleMonthChange = (month: string) => {
    if (selectedYear) {
      onChange(`${month} ${selectedYear}`);
    } else {
      // If no year selected yet, just store the month temporarily
      onChange(month);
    }
  };
  
  const handleYearChange = (year: string) => {
    if (selectedMonth && selectedMonth !== "" && !selectedMonth.includes(" ")) {
      onChange(`${selectedMonth} ${year}`);
    } else {
      // If no month selected yet, default to May (common graduation month)
      onChange(`May ${year}`);
    }
  };

  return (
    <div className={cn("flex gap-2 w-full", className)}>
      <Select value={selectedMonth} onValueChange={handleMonthChange}>
        <SelectTrigger className="flex-1 h-9">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((month) => (
            <SelectItem key={month} value={month}>
              {month}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select value={selectedYear} onValueChange={handleYearChange}>
        <SelectTrigger className="w-[90px] h-9">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {YEARS.map((year) => (
            <SelectItem key={year} value={year}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}